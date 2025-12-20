package proxy

import (
	"context" // 引入 context
	"edge-agent/internal/protocol"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

type SenderFunc func(v interface{}) error

const MockMode = true

// DoRequest 真正执行请求 (增加 ctx 参数)
func DoRequest(ctx context.Context, s *RequestStreamer, send SenderFunc) {
	reqID := s.ReqID

	select {
	case <-s.MetaReady:
	case <-time.After(10 * time.Second):
		sendError(send, reqID, "Header timeout")
		return
	case <-ctx.Done(): // 监听连接断开
		return
	}

	if MockMode {
		log.Printf("[Agent] MOCK MODE: Intercepting request %s", reqID)
		io.Copy(io.Discard, s.GetBodyReader())
		go mockOpenAIResponse(reqID, send)
		return
	}

	if !strings.HasPrefix(s.Meta.URL, "/") {
		sendError(send, reqID, "Invalid URL format: must start with /")
		return
	}
	if strings.Contains(s.Meta.URL, "@") {
		sendError(send, reqID, "Invalid URL format: illegal char @")
		return
	}

	targetURL := "https://api.openai.com" + s.Meta.URL
	
	// 补丁: 使用 NewRequestWithContext 绑定生命周期
	// 一旦 ctx 取消 (连接断开)，这个 HTTP 请求会立即终止
	realReq, err := http.NewRequestWithContext(ctx, s.Meta.Method, targetURL, s.GetBodyReader())
	if err != nil {
		sendError(send, reqID, "Create req failed: "+err.Error())
		return
	}

	if realReq.URL.Host != "api.openai.com" {
		sendError(send, reqID, "Security Alert: Host mismatch!")
		return
	}

	for k, v := range s.Meta.Headers {
		if k != "Accept-Encoding" {
			realReq.Header.Set(k, v)
		}
	}
	realReq.Host = "api.openai.com"

	client := &http.Client{Timeout: 180 * time.Second}
	resp, err := client.Do(realReq)
	if err != nil {
		// 如果是 ctx 取消导致的错误，我们就不发 error 给 Hub 了 (因为连接已经断了)
		if ctx.Err() == nil {
			sendError(send, reqID, "Network error: "+err.Error())
		}
		return
	}
	defer resp.Body.Close()

	buf := make([]byte, 4096)
	isFirst := true

	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			
			respPayload := protocol.HttpResponsePayload{
				BodyChunk: chunk,
				IsFinal:   false,
			}

			if isFirst {
				respPayload.StatusCode = resp.StatusCode
				respPayload.Headers = make(map[string]string)
				for k, v := range resp.Header {
					respPayload.Headers[k] = v[0]
				}
				isFirst = false
			}

			sendResponse(send, reqID, respPayload)
		}

		if err != nil {
			if err == io.EOF {
				finalPayload := protocol.HttpResponsePayload{IsFinal: true}
				sendResponse(send, reqID, finalPayload)
			} else {
				// 同样检查是否因 ctx 取消
				if ctx.Err() == nil {
					log.Printf("Read error: %v", err)
				}
			}
			break
		}
	}
}

// ... (Mock 和 sendResponse 保持不变) ...
func mockOpenAIResponse(reqID string, send SenderFunc) {
	words := []string{"Hello", "!", " MOCK", " Usage", " Test", "."}
	headerPayload := protocol.HttpResponsePayload{
		StatusCode: 200, Headers: map[string]string{"Content-Type": "text/event-stream"}, IsFinal: false,
	}
	sendResponse(send, reqID, headerPayload)
	for _, word := range words {
		time.Sleep(50 * time.Millisecond)
		content := fmt.Sprintf(`data: {"choices":[{"delta":{"content":"%s"}}]}`, word) + "\n\n"
		sendResponse(send, reqID, protocol.HttpResponsePayload{BodyChunk: []byte(content)})
	}
	time.Sleep(50 * time.Millisecond)
	usage := &protocol.Usage{PromptTokens: 5, CompletionTokens: 5}
	sendResponse(send, reqID, protocol.HttpResponsePayload{BodyChunk: []byte("data: [DONE]\n\n"), IsFinal: true, Usage: usage})
}

func sendResponse(send SenderFunc, reqID string, payload protocol.HttpResponsePayload) {
	data, _ := json.Marshal(payload)
	packet := protocol.Packet{Type: protocol.TypeResponse, RequestID: reqID, Payload: data}
	send(packet)
}

func sendError(send SenderFunc, reqID string, errMsg string) {
	sendResponse(send, reqID, protocol.HttpResponsePayload{Error: errMsg, IsFinal: true})
}