package gateway

import (
	"central-hub/internal/billing"
	"central-hub/internal/protocol"
	"central-hub/internal/tunnel"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
)

type Handler struct {
	tunnel  *tunnel.TunnelServer
	billing *billing.Manager
}

func NewHandler(t *tunnel.TunnelServer, b *billing.Manager) *Handler {
	return &Handler{
		tunnel:  t,
		billing: b,
	}
}

func (h *Handler) HandleOpenAIRequest(w http.ResponseWriter, r *http.Request) {
	reqID := uuid.New().String()

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	
	// 简单的 Body 解析以获取 Model (为了计费)
	// 这里会反序列化两次，有优化空间，MVP 先这样
	var reqBodyMap map[string]interface{}
	modelName := "unknown"
	if err := json.Unmarshal(body, &reqBodyMap); err == nil {
		if m, ok := reqBodyMap["model"].(string); ok {
			modelName = m
		}
	}

	payload := protocol.HttpRequestPayload{
		Method: r.Method,
		URL:    r.URL.Path,
		Headers: map[string]string{
			"Content-Type":  r.Header.Get("Content-Type"),
			"Authorization": r.Header.Get("Authorization"),
		},
		Body:         body,
		PriceVersion: h.billing.GetCurrentPriceTable().Version, // 带上版本号
	}

	// 派单
	targetAgentID := "auth-agent-001" // 注意：这里要和 Agent 启动 ID 一致
	respChan, err := h.tunnel.DispatchRequest(targetAgentID, reqID, payload)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to dispatch: %v", err), http.StatusServiceUnavailable)
		return
	}
	defer h.tunnel.CleanupRequest(reqID)

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	timeout := time.After(60 * time.Second)
	firstPacketReceived := false

	for {
		select {
		case packet, ok := <-respChan:
			if !ok {
				return
			}

			var resp protocol.HttpResponsePayload
			if err := json.Unmarshal(packet.Payload, &resp); err != nil {
				log.Printf("Invalid response payload: %v", err)
				return
			}

			if resp.Error != "" {
				http.Error(w, "Agent Error: "+resp.Error, http.StatusBadGateway)
				return
			}

			if !firstPacketReceived {
				if resp.StatusCode != 0 {
					w.WriteHeader(resp.StatusCode)
				}
				w.Header().Set("Content-Type", "text/event-stream")
				w.Header().Set("Connection", "keep-alive")
				firstPacketReceived = true
			}

			if len(resp.BodyChunk) > 0 {
				w.Write(resp.BodyChunk)
				flusher.Flush()
			}

			if resp.IsFinal {
				// === 结算时刻 ===
				if resp.Usage != nil {
					cost := h.billing.CalculateCost(modelName, resp.Usage, payload.PriceVersion)
					log.Printf("💰 [Billing] ReqID: %s, Model: %s, Usage: %+v, Cost: $%.6f", 
						reqID, modelName, resp.Usage, cost)
					
					// TODO: 写入 MySQL ledger 表
				} else {
					log.Printf("⚠️ [Billing] ReqID: %s finished but NO usage reported!", reqID)
				}
				return
			}

		case <-timeout:
			if !firstPacketReceived {
				http.Error(w, "Agent timeout", http.StatusGatewayTimeout)
			}
			return
		}
	}
}