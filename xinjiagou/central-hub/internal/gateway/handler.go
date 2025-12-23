package gateway

import (
	"central-hub/internal/billing"
	"central-hub/internal/cache"
	"central-hub/internal/config"
	"central-hub/internal/db"
	"central-hub/internal/middleware"
	"central-hub/internal/protocol"
	"central-hub/internal/tunnel"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/time/rate"
)

type Handler struct {
	tunnel      *tunnel.TunnelServer
	billing     *billing.Manager
	db          *db.DB
	redis       *cache.RedisStore
	userLimiters sync.Map // UserID -> *rate.Limiter
}

func NewHandler(t *tunnel.TunnelServer, b *billing.Manager, d *db.DB, r *cache.RedisStore) *Handler {
	return &Handler{tunnel: t, billing: b, db: d, redis: r}
}

func (h *Handler) getUserLimiter(userID int) *rate.Limiter {
	val, ok := h.userLimiters.Load(userID)
	if ok {
		return val.(*rate.Limiter)
	}
	// Default 60 RPM
	l := rate.NewLimiter(rate.Limit(1.0), 5) 
	h.userLimiters.Store(userID, l)
	return l
}

func logCtx(ctx context.Context, format string, v ...interface{}) {
	reqID, _ := ctx.Value(middleware.RequestIDKey).(string)
	log.Printf("[%s] "+format, append([]interface{}{reqID}, v...)...)
}

func maskKey(key string) string {
	if len(key) < 8 {
		return "***"
	}
	return key[:3] + "***" + key[len(key)-4:]
}

func (h *Handler) HandleRequest(w http.ResponseWriter, r *http.Request) {
	// Get Request ID from Middleware
	var reqID string
	if val := r.Context().Value(middleware.RequestIDKey); val != nil {
		reqID = val.(string)
	} else {
		reqID = uuid.New().String() // Fallback
	}

	authHeader := r.Header.Get("Authorization")
	apiKey := strings.TrimPrefix(authHeader, "Bearer ")
	if apiKey == "" {
		http.Error(w, "Missing Authorization header", http.StatusUnauthorized)
		return
	}

	user, err := h.db.GetUserByAPIKey(apiKey)
	if err != nil {
		logCtx(r.Context(), "[Auth] Invalid Key: %s", maskKey(apiKey))
		http.Error(w, "Invalid API Key", http.StatusUnauthorized)
		return
	}
	
	// RPM Check
	limiter := h.getUserLimiter(user.ID)
	if !limiter.Allow() {
		http.Error(w, "Rate limit exceeded (RPM)", http.StatusTooManyRequests)
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
	
	// 1. Pre-read for Sniffing
	sniffBuf := make([]byte, config.SniffBufferLen)
	n, _ := io.ReadFull(r.Body, sniffBuf)
	head := sniffBuf[:n]
	
	// 2. Sniff Model
	// Lightweight Sniffing logic moved here
	modelName := "unknown"
	
	sniffBytes := head
	if r.Header.Get("Content-Encoding") == "gzip" {
		gz, err := gzip.NewReader(bytes.NewReader(head))
		if err == nil {
			// Try to read enough for sniffing
			uncompressed := make([]byte, config.SniffBufferLen)
			n, _ := io.ReadFull(gz, uncompressed)
			sniffBytes = uncompressed[:n]
			gz.Close()
		}
	}
	
	// 1. Find "model"
	// Use head (string)
	headStr := string(sniffBytes)
	idx := strings.Index(headStr, `"model"`)
	if idx != -1 {
		rest := headStr[idx+7:]
		colonIdx := strings.Index(rest, ":")
		if colonIdx != -1 {
			valuePart := rest[colonIdx+1:]
			startQuote := strings.Index(valuePart, `"`)
			if startQuote != -1 {
				valueContent := valuePart[startQuote+1:]
				endQuote := strings.Index(valueContent, `"`)
				if endQuote != -1 {
					modelName = valueContent[:endQuote]
				}
			}
		}
	}

	// 3. Apply Dynamic Limit
	limit := config.GetLimit(modelName)
	
	// Check if we already exceeded limit in head? (Unlikely for 4KB head vs 1MB limit)
	
	// 4. Read Remaining with Limit
	// We read limit - n + 1 to detect overflow
	remainingLimit := limit - int64(n) + 1
	if remainingLimit < 0 { remainingLimit = 0 }
	
	remainingReader := io.LimitReader(r.Body, remainingLimit)
	fullReader := io.MultiReader(bytes.NewReader(head), remainingReader)
	
	body, err := io.ReadAll(fullReader)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	
	if int64(len(body)) > limit {
		logCtx(r.Context(), "[Gateway] Request too large for model %s. Size: %d, Limit: %d", modelName, len(body), limit)
		http.Error(w, "Request entity too large", http.StatusRequestEntityTooLarge)
		return
	}

	// Extract Provider from API Key prefix


	// Extract Provider from API Key prefix
	// e.g. "sk-ant-..." -> "anthropic"
	// e.g. "sk-goog-..." -> "google"
	// Default to "openai"
	targetProvider := "openai"
	if strings.HasPrefix(apiKey, "sk-ant-") {
		targetProvider = "anthropic"
	} else if strings.HasPrefix(apiKey, "sk-goog-") {
		targetProvider = "google"
	} else if strings.HasPrefix(apiKey, "sk-aws-") {
		targetProvider = "aws"
	} else if strings.HasPrefix(apiKey, "sk-azure-") {
		targetProvider = "azure"
	}

	result, err := h.tunnel.SelectAgent(r.Context(), targetProvider, modelName)
	if err != nil {
		logCtx(r.Context(), "[Gateway] No agent found for provider %s model %s: %v", targetProvider, modelName, err)
		http.Error(w, fmt.Sprintf("No agent available for %s/%s", targetProvider, modelName), http.StatusServiceUnavailable)
		return
	}
	
	targetAgentID := result.AgentID
	targetInstanceID := result.InstanceID

	respChan, err := h.tunnel.InitRequest(targetAgentID, reqID)
	if err != nil {
		logCtx(r.Context(), "[Gateway] InitRequest failed (Agent offline?): %v", err)
		http.Error(w, fmt.Sprintf("Agent offline: %v", err), http.StatusServiceUnavailable)
		return
	}
	defer h.tunnel.CleanupRequest(reqID)

		errChan := make(chan error, 1)
		go func() {
			defer close(errChan)
			
			// Filter Headers
			headers := make(map[string]string)
			for k, v := range r.Header {
				// Limit header size
				if len(k) > 100 || len(v[0]) > 1000 { continue }
				headers[k] = v[0]
			}
			
			metaPayload := protocol.HttpRequestPayload{
				Method:           r.Method,
				URL:              r.URL.Path, // Path Pass-through
				Headers:          headers,
				PriceVersion:     h.billing.GetCurrentPriceTable().Version,
				IsFinal:          false,
				TargetInstanceID: targetInstanceID,
				TargetProvider:   targetProvider, // 传递 Provider
			}
			if err := h.tunnel.SendRequestChunk(targetAgentID, reqID, metaPayload); err != nil {			        			errChan <- err
			        			return
			        		}
			        
			        		chunkSize := config.ChunkSize
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
		
		var totalBytesSent int64
	
		for {
			select {
			case <-ctx.Done():
				logCtx(ctx, "[Gateway] Client disconnected")
				h.tunnel.SendAbort(targetAgentID, reqID)
				h.tunnel.CleanupRequest(reqID)
				return
			case packet, ok := <-respChan:
				if !ok { return }
	
							var resp protocol.HttpResponsePayload
							if err := json.Unmarshal(packet.Payload, &resp); err != nil { return }
							
							if resp.Error != "" {
								w.Header().Set("Content-Type", "application/json")
								w.WriteHeader(http.StatusBadGateway)
								json.NewEncoder(w).Encode(map[string]interface{}{
									"error": map[string]string{
										"message": resp.Error,
										"type":    "agent_error",
										"code":    resp.ErrorType,
									},
								})
								return
							}
				
							if !firstPacketReceived {
								if resp.StatusCode != 0 { w.WriteHeader(resp.StatusCode) }
								w.Header().Set("Content-Type", "text/event-stream")
								w.Header().Set("Connection", "keep-alive")
								firstPacketReceived = true
							}
				
							if len(resp.BodyChunk) > 0 {					w.Write(resp.BodyChunk)
					flusher.Flush()
					
					totalBytesSent += int64(len(resp.BodyChunk))
					// Rough check: 1MB ~ $0.05 (GPT-4 text). If balance < $0.01 and bytes > 10MB, kill.
					if user.Balance < 1.0 && totalBytesSent > 10*1024*1024 {
						logCtx(ctx, "[Gateway] Abort: Low balance and high traffic")
						h.tunnel.SendAbort(targetAgentID, reqID)
						return
					}
				}

				if resp.IsFinal {
					if resp.Usage != nil {
						priceVer := h.billing.GetCurrentPriceTable().Version
						cost := h.billing.CalculateCost(modelName, resp.Usage, priceVer) 
						agentIncome := cost * 0.8
						
						logCtx(ctx, "💰 [Settlement] User: %d, Cost: $%.6f, Hash: %s", 
							user.ID, cost, resp.AgentHash)
						
						// 修复: 先写 MySQL (真理)，成功后再更新 Redis (缓存)
						if err := h.db.SettleTransaction(reqID, user.ID, targetAgentID, modelName, priceVer, cost, agentIncome, resp.AgentHash); err != nil {
							logCtx(ctx, "❌ [DB] Settle failed: %v", err)
						} else {
							h.redis.IncrAgentIncome(context.Background(), targetAgentID, agentIncome)
							logCtx(ctx, "✅ [DB] Settle success!")
						}
					}
					return
				}
			case <-timeout:
			return
		}
	}
}
