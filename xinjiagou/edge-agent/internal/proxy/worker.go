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

type SenderFunc func(v interface{}) error

const MockMode = true

func HandleRequestWithSender(packet protocol.Packet, send SenderFunc) {
	reqID := packet.RequestID

	var reqPayload protocol.HttpRequestPayload
	if err := json.Unmarshal(packet.Payload, &reqPayload); err != nil {
		sendError(send, reqID, "Invalid payload format")
		return
	}

	if MockMode {
		log.Printf("[Agent] MOCK MODE: Intercepting request %s", reqID)
		go mockOpenAIResponse(reqID, send)
		return
	}

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

	// simpleTokenCount := 0 

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
				finalPayload := protocol.HttpResponsePayload{
					IsFinal: true,
					Usage: &protocol.Usage{
						PromptTokens:     10,
						CompletionTokens: 20,
					},
				}
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

	// 1. Header
	headerPayload := protocol.HttpResponsePayload{
		StatusCode: 200,
		Headers: map[string]string{"Content-Type": "text/event-stream"},
		IsFinal:   false,
	}
	sendResponse(send, reqID, headerPayload)

	// 2. Stream Body
	for _, word := range words {
		time.Sleep(50 * time.Millisecond)
		content := fmt.Sprintf(`data: {"choices":[{"delta":{"content":"%s"}}]}`, word) + "\n\n"
		sendResponse(send, reqID, protocol.HttpResponsePayload{BodyChunk: []byte(content)})
	}

	// 3. Final with Usage
	time.Sleep(50 * time.Millisecond)
	
	usage := &protocol.Usage{
		PromptTokens:     5,
		CompletionTokens: len(words), // 6
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