package proxy

import (
	"context"
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
// 修改: 回调返回 Hash 字符串
type CompleteCallback func(reqID string, usage *protocol.Usage) string

const MockMode = true

func DoRequest(ctx context.Context, s *RequestStreamer, send SenderFunc, onComplete CompleteCallback) {
	reqID := s.ReqID

	select {
	case <-s.MetaReady:
	case <-time.After(10 * time.Second):
		sendError(send, reqID, "Header timeout")
		return
	case <-ctx.Done():
		return
	}

	if MockMode {
		log.Printf("[Agent] MOCK MODE: Intercepting request %s", reqID)
		io.Copy(io.Discard, s.GetBodyReader())
		go mockOpenAIResponse(reqID, send, onComplete)
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
				
				// TODO: 在这里解析 Usage 并调用 onComplete
				// 为了简化，这里先不传 Usage
				// 真实场景：ParseSSE(buffer) -> Usage
				
sendResponse(send, reqID, finalPayload)
			} else {
				if ctx.Err() == nil {
					log.Printf("Read error: %v", err)
				}
			}
			break
		}
	}
}

func mockOpenAIResponse(reqID string, send SenderFunc, onComplete CompleteCallback) {
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
	
	// 回调写入 SQLite 并获取 Hash
	hash := ""
	if onComplete != nil {
		hash = onComplete(reqID, usage)
	}

	sendResponse(send, reqID, protocol.HttpResponsePayload{
		BodyChunk: []byte("data: [DONE]\n\n"),
		IsFinal:   true,
		Usage:     usage,
		AgentHash: hash, // 发送 Hash
	})
}

func sendResponse(send SenderFunc, reqID string, payload protocol.HttpResponsePayload) {
	data, _ := json.Marshal(payload)
	packet := protocol.Packet{Type: protocol.TypeResponse, RequestID: reqID, Payload: data}
	send(packet)
}

func sendError(send SenderFunc, reqID string, errMsg string) {
	sendResponse(send, reqID, protocol.HttpResponsePayload{Error: errMsg, IsFinal: true})
}