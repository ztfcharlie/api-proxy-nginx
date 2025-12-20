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
	return &Handler{tunnel: t, billing: b}
}

func (h *Handler) HandleOpenAIRequest(w http.ResponseWriter, r *http.Request) {
	reqID := uuid.New().String()

	// 回滚: 恢复为指定的认证 Agent ID
	targetAgentID := "auth-agent-001"

	// 1. 初始化请求通道
	respChan, err := h.tunnel.InitRequest(targetAgentID, reqID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Agent offline: %v", err), http.StatusServiceUnavailable)
		return
	}
	defer h.tunnel.CleanupRequest(reqID)

	// 2. 启动流式发送 Goroutine
	errChan := make(chan error, 1)
	go func() {
		defer close(errChan)
		
		metaPayload := protocol.HttpRequestPayload{
			Method:       r.Method,
			URL:          r.URL.Path,
			Headers:      map[string]string{
				"Content-Type":  r.Header.Get("Content-Type"),
				"Authorization": r.Header.Get("Authorization"),
			},
			PriceVersion: h.billing.GetCurrentPriceTable().Version,
			IsFinal:      false,
		}
		if err := h.tunnel.SendRequestChunk(targetAgentID, reqID, metaPayload); err != nil {
			errChan <- err
			return
		}

		buf := make([]byte, 32*1024) 
		for {
			n, readErr := r.Body.Read(buf)
			if n > 0 {
				chunkPayload := protocol.HttpRequestPayload{
					BodyChunk: buf[:n],
					IsFinal:   false,
				}
				if err := h.tunnel.SendRequestChunk(targetAgentID, reqID, chunkPayload); err != nil {
					errChan <- err
					return
				}
			}
			if readErr != nil {
				if readErr == io.EOF {
					endPayload := protocol.HttpRequestPayload{IsFinal: true}
					h.tunnel.SendRequestChunk(targetAgentID, reqID, endPayload)
				}
				break
			}
		}
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
				// 结算逻辑
				return
			}

		case <-timeout:
			return
		}
	}
}