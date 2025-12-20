package proxy

import (
	"bytes"
	"edge-agent/internal/protocol"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// SenderFunc 定义发送数据的函数签名
type SenderFunc func(v interface{}) error

// MockMode 控制是否开启模拟模式
const MockMode = true

// HandleRequestWithSender 处理请求
func HandleRequestWithSender(packet protocol.Packet, send SenderFunc) {
	reqID := packet.RequestID

	var reqPayload protocol.HttpRequestPayload
	if err := json.Unmarshal(packet.Payload, &reqPayload); err != nil {
		sendError(send, reqID, "Invalid payload format")
		return
	}

	// === MOCK 逻辑开始 ===
	if MockMode {
		log.Printf("[Agent] MOCK MODE: Intercepting request %s", reqID)
		go mockOpenAIResponse(reqID, send)
		return
	}
	// === MOCK 逻辑结束 ===

	targetURL := "https://api.openai.com" + reqPayload.URL 
	
	realReq, err := http.NewRequest(reqPayload.Method, targetURL, bytes.NewReader(reqPayload.Body))
	if err != nil {
		sendError(send, reqID, "Failed to create request: "+err.Error())
		return
	}

	for k, v := range reqPayload.Headers {
		if k != "Accept-Encoding" {
			realReq.Header.Set(k, v)
		}
	}
	realReq.Host = "api.openai.com"

	log.Printf("[Agent] Forwarding request %s -> %s", reqID, targetURL)

	client := &http.Client{}
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
				sendResponse(send, reqID, protocol.HttpResponsePayload{IsFinal: true})
			} else {
				log.Printf("Read error: %v", err)
			}
			break
		}
	}
}

// mockOpenAIResponse 模拟 OpenAI 的流式响应
func mockOpenAIResponse(reqID string, send SenderFunc) {
	words := []string{"Hello", "!", " This", " is", " a", " MOCK", " response", " from", " Agent", ".", " I", " am", " alive", "!"}

	// 1. 发送头部
	headerPayload := protocol.HttpResponsePayload{
		StatusCode: 200,
		Headers: map[string]string{
			"Content-Type": "text/event-stream",
			"Server":       "MockAgent/1.0",
		},
		BodyChunk: []byte(""),
		IsFinal:   false,
	}
	sendResponse(send, reqID, headerPayload)

	// 2. 模拟逐字吐出
	for _, word := range words {
		time.Sleep(100 * time.Millisecond)

		content := fmt.Sprintf(`data: {"id":"chatcmpl-mock","object":"chat.completion.chunk","created":123,"model":"gpt-mock","choices":[{"index":0,"delta":{"content":"%s"},"finish_reason":null}]}`+"\n\n", word)
		
		chunkPayload := protocol.HttpResponsePayload{
			BodyChunk: []byte(content),
			IsFinal:   false,
		}
		sendResponse(send, reqID, chunkPayload)
	}

	// 3. 发送 [DONE]
	time.Sleep(100 * time.Millisecond)
	donePayload := protocol.HttpResponsePayload{
		BodyChunk: []byte("data: [DONE]\n\n"),
		IsFinal:   true,
	}
	sendResponse(send, reqID, donePayload)
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
	payload := protocol.HttpResponsePayload{
		Error:   errMsg,
		IsFinal: true,
	}
	sendResponse(send, reqID, payload)
}