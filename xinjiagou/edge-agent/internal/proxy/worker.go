package proxy

import (
	"context"
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

// DoRequest 执行真实的代理请求
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

	instanceID := s.Meta.TargetInstanceID
	if instanceID == "" {
		sendError(send, reqID, "No TargetInstanceID provided")
		return
	}

	// 1. 查找实例配置 (Mock Lookup)
	// 在真实代码中，这里应该查本地 DB 或 Config
	instance := &protocol.InstanceConfig{
		ID: instanceID,
		// 临时: 假设 ID 就是 Key，且 Endpoint 是官方的
		// 生产环境必须从加密存储读取
	}
	
	// 2. 选择适配器
	// 我们需要知道 Provider，但 s.Meta (HttpRequestPayload) 里没传 Provider
	// 这是一个设计遗漏。Hub 应该传 Provider 或者我们根据 InstanceID 查出来。
	// 临时方案: 假设 instanceID 包含 provider 前缀 (如 ant-1, acc-1=openai)
	providerName := "openai"
	if strings.HasPrefix(instanceID, "ant-") {
		providerName = "anthropic"
	}
	// 更严谨的做法: protocol.HttpRequestPayload 应该包含 Provider 字段
	
	adapter := providers.GetAdapter(providerName)
	sniffer := adapter.GetSniffer()

	// 3. 构造请求
	// 默认 BaseURL
	baseURL := "https://api.openai.com"
	if providerName == "anthropic" {
		baseURL = "https://api.anthropic.com"
	}
	
	targetURL := baseURL + s.Meta.URL
	
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
	client := &http.Client{Timeout: 180 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		sendError(send, reqID, "Network error: "+err.Error())
		return
	}
	defer resp.Body.Close()

	// 6. 处理响应
	// 使用 TeeReader: 一边发给 Hub，一边喂给 Sniffer
	pr, pw := io.Pipe()
	
	// 启动一个 goroutine 负责把 resp.Body 写入 pipe
	// 同时也写入 Sniffer
	go func() {
		defer pw.Close()
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