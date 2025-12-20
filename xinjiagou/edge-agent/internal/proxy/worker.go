package proxy

import (
	"edge-agent/internal/protocol"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type SenderFunc func(v interface{}) error

const MockMode = true

// DoRequest 真正执行请求
func DoRequest(s *RequestStreamer, send SenderFunc) {
	reqID := s.ReqID

	// 等待 Header 到达
	select {
	case <-s.MetaReady:
	case <-time.After(10 * time.Second):
		sendError(send, reqID, "Header timeout")
		return
	}

	if MockMode {
		log.Printf("[Agent] MOCK MODE: Intercepting request %s", reqID)
		// 即使是 Mock，也要把 Body 读完，否则 Pipe 可能阻塞
		io.Copy(io.Discard, s.GetBodyReader())
		go mockOpenAIResponse(reqID, send)
		return
	}

	targetURL := "https://api.openai.com" + s.Meta.URL
	
	// 使用 s.GetBodyReader() 作为 Body
	realReq, err := http.NewRequest(s.Meta.Method, targetURL, s.GetBodyReader())
	if err != nil {
		sendError(send, reqID, "Create req failed: "+err.Error())
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
		sendError(send, reqID, "Network error: "+err.Error())
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
				log.Printf("Read error: %v", err)
			}
			break
		}
	}
}

func mockOpenAIResponse(reqID string, send SenderFunc) {
	words := []string{"Hello", "!", " MOCK", " Usage", " Test", "."}

	headerPayload := protocol.HttpResponsePayload{
		StatusCode: 200,
		Headers: map[string]string{"Content-Type": "text/event-stream"},
		IsFinal:   false,
	}
	sendResponse(send, reqID, headerPayload)

	for _, word := range words {
		time.Sleep(50 * time.Millisecond)
		content := fmt.Sprintf(`data: {"choices":[{"delta":{"content":"%s"}}]}`, word) + "\n\n"
		sendResponse(send, reqID, protocol.HttpResponsePayload{BodyChunk: []byte(content)})
	}

	time.Sleep(50 * time.Millisecond)
	
	usage := &protocol.Usage{
		PromptTokens:     5,
		CompletionTokens: len(words), 
	}

	sendResponse(send, reqID, protocol.HttpResponsePayload{
		BodyChunk: []byte("data: [DONE]\n\n"),
		IsFinal:   true,
		Usage:     usage,
	})
}

func sendResponse(send SenderFunc, reqID string, payload protocol.HttpResponsePayload) {
	data, _ := json.Marshal(payload)
	packet := protocol.Packet{
		Type:      protocol.TypeResponse,
		RequestID: reqID,
		Payload:   data,
	}
	send(packet)
}

func sendError(send SenderFunc, reqID string, errMsg string) {
	sendResponse(send, reqID, protocol.HttpResponsePayload{Error: errMsg, IsFinal: true})
}