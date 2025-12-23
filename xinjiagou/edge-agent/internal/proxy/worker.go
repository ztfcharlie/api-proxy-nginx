package proxy

import (
	"context"
	"edge-agent/internal/config"
	"edge-agent/internal/protocol"
	"edge-agent/internal/proxy/providers"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

type SenderFunc func(v interface{}) error
type CompleteCallback func(reqID string, usage *protocol.Usage) string

// Dependency Injection for Config Lookup
var GetInstanceConfig func(id string) *protocol.InstanceConfig

// DoRequest 执行真实的代理请求
func DoRequest(ctx context.Context, s *RequestStreamer, send SenderFunc, onComplete CompleteCallback) {
	reqID := s.ReqID

	select {
	case <-s.MetaReady:
	case <-time.After(10 * time.Second): // Header wait timeout could also be a const
		sendError(send, reqID, "Header timeout")
		return
	case <-ctx.Done():
		return
	}

	instanceID := s.Meta.TargetInstanceID
	if instanceID == "" {
		sendError(send, reqID, "No TargetInstanceID provided")
		return
	}

	// 1. 查找实例配置
	var instance *protocol.InstanceConfig
	if GetInstanceConfig != nil {
		instance = GetInstanceConfig(instanceID)
	}
	
	// Fallback or Error if not found
	if instance == nil {
		// Try minimal fallback if ID is self-contained (e.g. key)? No, unsafe.
		// Fail fast.
		sendError(send, reqID, "Instance config not found: "+instanceID)
		return 
	}
	
	// 2. 选择适配器
	providerName := s.Meta.TargetProvider
	log.Printf("[Worker] Received Request. Provider: %s, InstanceID: %s", providerName, instanceID)
	
	if providerName == "" {
		providerName = "openai" // Fallback
	}
	
	adapter := providers.GetAdapter(providerName)
	sniffer := adapter.GetSniffer()

	// 3. 构造请求
	baseURL := adapter.GetBaseURL(instance)
	
	// Join Path safely
	// If baseURL has path (e.g. Azure), join it correctly with request path
	baseHasSlash := strings.HasSuffix(baseURL, "/")
	reqHasSlash := strings.HasPrefix(s.Meta.URL, "/")
	
	var targetURL string
	if baseHasSlash && reqHasSlash {
		targetURL = baseURL + s.Meta.URL[1:]
	} else if !baseHasSlash && !reqHasSlash {
		targetURL = baseURL + "/" + s.Meta.URL
	} else {
		targetURL = baseURL + s.Meta.URL
	}
	
	log.Printf("[Worker] Sending request to: %s", targetURL)
	
	req, err := http.NewRequestWithContext(ctx, s.Meta.Method, targetURL, s.GetBodyReader())
	if err != nil {
		sendError(send, reqID, "NewReq failed: "+err.Error())
		return
	}

	// 4. 适配器重写请求 (鉴权/Header)
	if err := adapter.RewriteRequest(req, instance); err != nil {
		sendError(send, reqID, "Rewrite failed: "+err.Error())
		return
	}

	// 5. 发送请求
	client := &http.Client{Timeout: config.DefaultRequestTimeout}
	resp, err := client.Do(req)
	if err != nil {
		// Network Error -> Feedback
		sendResponse(send, reqID, protocol.HttpResponsePayload{
			Error:     "Network error: " + err.Error(),
			ErrorType: "network_error",
			IsFinal:   true,
		})
		return
	}
	defer resp.Body.Close()

	// Resilience Logic: Check Status
	if resp.StatusCode == 429 || resp.StatusCode >= 500 {
		retryAfter := 0
		// Parse Retry-After Header
		if val := resp.Header.Get("Retry-After"); val != "" {
			// Try parse int
			fmt.Sscanf(val, "%d", &retryAfter)
		}
		
		errType := "server_error"
		if resp.StatusCode == 429 { errType = "rate_limit" }
		
		// Send Error with Feedback Info
		// We DO NOT stream the body for these errors to avoid partial content.
		// Just fail fast.
		sendResponse(send, reqID, protocol.HttpResponsePayload{
			StatusCode: resp.StatusCode,
			Error:      fmt.Sprintf("Upstream Error %d", resp.StatusCode),
			ErrorType:  errType,
			RetryAfter: retryAfter,
			InstanceID: instanceID, // Feedback Source
			IsFinal:    true,
		})
		return
	}

	// 6. 处理响应
	// 使用 TeeReader: 一边发给 Hub，一边喂给 Sniffer
	pr, pw := io.Pipe()
	defer pr.Close() // Ensure reader is closed to unblock writer
	
	// 启动一个 goroutine 负责把 resp.Body 写入 pipe
	// 同时也写入 Sniffer
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[Worker] Panic in pipe copy: %v", r)
			}
			pw.Close() // Ensure pipe is closed
		}()
		// MultiWriter: 写入 Pipe (给 Hub) 和 Sniffer (计费)
		mw := io.MultiWriter(pw, sniffer)
		
		buf := make([]byte, 4096)
		for {
			n, err := resp.Body.Read(buf)
			if n > 0 {
				mw.Write(buf[:n])
			}
			if err != nil {
				break
			}
		}
	}()

	// 主循环: 读取 pipe 发送给 Hub
	buf := make([]byte, 4096)
	isFirst := true
	
	for {
		n, err := pr.Read(buf)
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
				// 7. 流结束，上报计费
				usage := sniffer.GetUsage()
				hash := ""
				if onComplete != nil && usage != nil {
					hash = onComplete(reqID, usage)
				}
				
				sendResponse(send, reqID, protocol.HttpResponsePayload{
					IsFinal:   true,
					Usage:     usage,
					AgentHash: hash,
				})
			} else {
				log.Printf("Read pipe error: %v", err)
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