package gateway

import (
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
	tunnel *tunnel.TunnelServer
}

func NewHandler(t *tunnel.TunnelServer) *Handler {
	return &Handler{tunnel: t}
}

// HandleOpenAIRequest 处理 /v1/chat/completions
func (h *Handler) HandleOpenAIRequest(w http.ResponseWriter, r *http.Request) {
	// 1. 生成 RequestID
	reqID := uuid.New().String()

	// 2. 读取 Body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	// 3. 构造透传 Payload
	// 注意：这里我们做的是 "字节级透传"，不解析 JSON
	payload := protocol.HttpRequestPayload{
		Method: r.Method,
		URL:    r.URL.Path, // /v1/chat/completions
		Headers: map[string]string{
			"Content-Type":  r.Header.Get("Content-Type"),
			"Authorization": r.Header.Get("Authorization"), // 透传 Key
		},
		Body: body,
	}

	// 4. 选择 Agent (暂时硬编码为第一个连上来的 Agent，这里为了测试方便写死 ID)
	// TODO: 真正的路由逻辑
	targetAgentID := "agent-dev-001" 

	// 5. 分发请求
	respChan, err := h.tunnel.DispatchRequest(targetAgentID, reqID, payload)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to dispatch: %v", err), http.StatusServiceUnavailable)
		return
	}
	defer h.tunnel.CleanupRequest(reqID)

	// 6. 接收响应并流式写回
	// 设置 HTTP Header 支持流式输出
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	// 设置超时 (防止 Agent 死锁)
	timeout := time.After(60 * time.Second)
	firstPacketReceived := false

	for {
		select {
		case packet, ok := <-respChan:
			if !ok {
				return // Channel closed
			}

			// 解析 Response Payload
			var resp protocol.HttpResponsePayload
			if err := json.Unmarshal(packet.Payload, &resp); err != nil {
				log.Printf("Invalid response payload: %v", err)
				return
			}

			// 如果有错误，直接返回 502
			if resp.Error != "" {
				http.Error(w, "Agent Error: "+resp.Error, http.StatusBadGateway)
				return
			}

			// 处理第一个包 (Header + Status)
			if !firstPacketReceived {
				if resp.StatusCode != 0 {
					w.WriteHeader(resp.StatusCode)
				}
				// 可以在这里设置 Content-Type: text/event-stream
				w.Header().Set("Content-Type", "text/event-stream")
				w.Header().Set("Cache-Control", "no-cache")
				w.Header().Set("Connection", "keep-alive")
				firstPacketReceived = true
			}

			// 写入数据块
			if len(resp.BodyChunk) > 0 {
				w.Write(resp.BodyChunk)
				flusher.Flush() // 立即推送给用户 -> 关键！
			}

			// 如果是最后一个包，结束循环
			if resp.IsFinal {
				return
			}

		case <-timeout:
			// 超时了
			if !firstPacketReceived {
				http.Error(w, "Agent timeout", http.StatusGatewayTimeout)
			}
			return
		}
	}
}
