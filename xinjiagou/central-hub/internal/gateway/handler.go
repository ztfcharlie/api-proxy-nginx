package gateway

import (
	"central-hub/internal/billing"
	"central-hub/internal/cache"
	"central-hub/internal/db"
	"central-hub/internal/protocol"
	"central-hub/internal/tunnel"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Handler struct {
	tunnel  *tunnel.TunnelServer
	billing *billing.Manager
	db      *db.DB
	redis   *cache.RedisStore
}

func NewHandler(t *tunnel.TunnelServer, b *billing.Manager, d *db.DB, r *cache.RedisStore) *Handler {
	return &Handler{tunnel: t, billing: b, db: d, redis: r}
}

func (h *Handler) HandleRequest(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	apiKey := strings.TrimPrefix(authHeader, "Bearer ")
	if apiKey == "" {
		http.Error(w, "Missing Authorization header", http.StatusUnauthorized)
		return
	}

	user, err := h.db.GetUserByAPIKey(apiKey)
	if err != nil {
		log.Printf("[Auth] Invalid Key: %s", apiKey)
		http.Error(w, "Invalid API Key", http.StatusUnauthorized)
		return
	}
	
	activeCount, err := h.redis.IncrUserActive(r.Context(), user.ID)
	if err == nil {
		maxConcurrent := 10
		if user.Balance < 5.0 {
			maxConcurrent = 1
		}
		if int(activeCount) > maxConcurrent {
			h.redis.DecrUserActive(context.Background(), user.ID)
			http.Error(w, fmt.Sprintf("Concurrency limit exceeded. Balance < 5.0 allows 1 concurrent req."), http.StatusTooManyRequests)
			return
		}
	}
	defer h.redis.DecrUserActive(context.Background(), user.ID)

	if user.Balance <= 0 {
		http.Error(w, "Insufficient balance", http.StatusPaymentRequired)
		return
	}

	reqID := uuid.New().String()
	
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	// === 风控拦截点 (Moderation Filter) ===
	// TODO: 将来接入真实的大模型审核 API
	// 目前仅做简单的 Mock 演示: 如果内容包含 "illegal_bomb", 则拦截
	if strings.Contains(string(body), "illegal_bomb") {
		log.Printf("[Moderation] Blocked request %s due to sensitive content", reqID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden) // 403 or 401 as requested
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]string{
				"code":    "sensitive_words_detected",
				"message": "Content moderation failed with status 403",
				"type":    "hub_error",
			},
		})
		return
	}
	// ======================================
	
	// Lightweight Sniffing: Try to find "model" in the first 1KB
	// Avoid full JSON parsing to support stream/partial bodies
	modelName := "unknown"
	limit := 1024
	if len(body) < limit { limit = len(body) }
	head := string(body[:limit])
	
	// Very naive regex-like search: "model": "xyz"
	// Better approach: use a fast json parser like buger/jsonparser, but for now str matching is okay for MVP
	if idx := strings.Index(head, `"model"`); idx != -1 {
		// Look for value after :
		rest := head[idx+7:]
		if startQuote := strings.Index(rest, `"` ); startQuote != -1 {
			rest = rest[startQuote+1:]
			if endQuote := strings.Index(rest, `"` ); endQuote != -1 {
				modelName = rest[:endQuote]
			}
		}
	}

	// Extract Provider from API Key prefix
	// e.g. "sk-ant-..." -> "anthropic"
	// e.g. "sk-goog-..." -> "google"
	// Default to "openai"
	targetProvider := "openai"
	if strings.HasPrefix(apiKey, "sk-ant-") {
		targetProvider = "anthropic"
	} else if strings.HasPrefix(apiKey, "sk-goog-") {
		targetProvider = "google"
	}

	result, err := h.tunnel.SelectAgent(r.Context(), targetProvider, modelName)
	if err != nil {
		log.Printf("[Gateway] No agent found for provider %s model %s: %v", targetProvider, modelName, err)
		http.Error(w, fmt.Sprintf("No agent available for %s/%s", targetProvider, modelName), http.StatusServiceUnavailable)
		return
	}
	
	targetAgentID := result.AgentID
	targetInstanceID := result.InstanceID

	respChan, err := h.tunnel.InitRequest(targetAgentID, reqID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Agent offline: %v", err), http.StatusServiceUnavailable)
		return
	}
	defer h.tunnel.CleanupRequest(reqID)

	errChan := make(chan error, 1)
	go func() {
		defer close(errChan)
		
		metaPayload := protocol.HttpRequestPayload{
			Method:           r.Method,
			URL:              r.URL.Path, // Path Pass-through
			Headers:          map[string]string{
				"Content-Type":  r.Header.Get("Content-Type"),
				"Authorization": r.Header.Get("Authorization"),
			},
			PriceVersion:     h.billing.GetCurrentPriceTable().Version,
			IsFinal:          false,
			TargetInstanceID: targetInstanceID,
		}
		if err := h.tunnel.SendRequestChunk(targetAgentID, reqID, metaPayload); err != nil {
			errChan <- err
			return
		}

		chunkSize := 32 * 1024
		for i := 0; i < len(body); i += chunkSize {
			end := i + chunkSize
			if end > len(body) { end = len(body) }
			chunk := body[i:end]
			
			if err := h.tunnel.SendRequestChunk(targetAgentID, reqID, protocol.HttpRequestPayload{
				BodyChunk: chunk, IsFinal: false,
			}); err != nil {
				errChan <- err
				return
			}
		}
		h.tunnel.SendRequestChunk(targetAgentID, reqID, protocol.HttpRequestPayload{IsFinal: true})
	}()

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	timeout := time.After(60 * time.Second)
	firstPacketReceived := false
	ctx := r.Context()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[Gateway] Client disconnected %s", reqID)
			return
		case err := <-errChan:
			if err != nil {
				log.Printf("[Gateway] Upload error: %v", err)
				return
			}
		case packet, ok := <-respChan:
			if !ok { return }

			var resp protocol.HttpResponsePayload
			if err := json.Unmarshal(packet.Payload, &resp); err != nil { return }

			if resp.Error != "" {
				http.Error(w, "Agent Error: "+resp.Error, http.StatusBadGateway)
				return
			}

			if !firstPacketReceived {
				if resp.StatusCode != 0 { w.WriteHeader(resp.StatusCode) }
				w.Header().Set("Content-Type", "text/event-stream")
				w.Header().Set("Connection", "keep-alive")
				firstPacketReceived = true
			}

			if len(resp.BodyChunk) > 0 {
				w.Write(resp.BodyChunk)
				flusher.Flush()
			}

			if resp.IsFinal {
				if resp.Usage != nil {
					priceVer := h.billing.GetCurrentPriceTable().Version
					cost := h.billing.CalculateCost(modelName, resp.Usage, priceVer) 
					agentIncome := cost * 0.8
					
					log.Printf("💰 [Settlement] ReqID: %s, User: %d, Cost: $%.6f, Hash: %s", 
						reqID, user.ID, cost, resp.AgentHash)
					
					// 修复: 先写 MySQL (真理)，成功后再更新 Redis (缓存)
					// 防止数据库回滚导致 Redis 虚增收入
					if err := h.db.SettleTransaction(reqID, user.ID, targetAgentID, modelName, priceVer, cost, agentIncome, resp.AgentHash); err != nil {
						log.Printf("❌ [DB] Settle failed: %v", err)
						// 注意：这里不用回滚 Redis，因为还没加呢
					} else {
						// DB 成功了，现在可以安全地更新 Redis 显示了
						h.redis.IncrAgentIncome(context.Background(), targetAgentID, agentIncome)
						log.Printf("✅ [DB] Settle success!")
					}
				}
				return
			}

		case <-timeout:
			return
		}
	}
}
