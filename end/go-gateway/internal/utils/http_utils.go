package utils

import (
	"encoding/json"
	"net/http"
	"strings"
)

// IsStreamingRequest 检测是否为流式请求
// 注意：这可能需要读取 Body，所以如果读取了，需要 Restore
func IsStreamingRequest(req *http.Request) bool {
	// 1. Check URL parameters
	query := req.URL.Query()
	if query.Get("stream") == "true" || strings.Contains(req.URL.Path, ":stream") {
		return true
	}
	if query.Get("alt") == "sse" {
		return true
	}

	// 2. Check Accept Header
	accept := req.Header.Get("Accept")
	if strings.Contains(accept, "text/event-stream") {
		return true
	}

	// 3. Check JSON Body for "stream": true
	// 这是一个破坏性操作 (Read Body)，必须小心。
	// 建议在 Middleware 统一读取并 Restore，这里假设 Body 可读或已缓冲。
	// 由于 Go 的 http.Request.Body 是 Stream，一旦读取就没了。
	// 我们通常在 Middleware (Capture) 阶段做这个，或者使用 GetBody (如果是 NopCloser 包装的 Bytes)
	
	// 在我们的架构中，Auth/Billing Middleware 会处理 Body。
	// 这里只提供基于 Header/URL 的快速检查。
	// Body 的检查我们放在 CaptureMiddleware 里做，因为它本来就要拦截 Body。
	
	return false
}

// IsStreamingResponse 检测上游响应是否为流式
func IsStreamingResponse(resp *http.Response) bool {
	// 1. Check Content-Type
	ct := resp.Header.Get("Content-Type")
	if strings.Contains(ct, "text/event-stream") {
		return true
	}

	// 2. Check Transfer-Encoding
	// 注意：Go 的 http client 自动处理 chunked，resp.TransferEncoding 可能包含 "chunked"
	for _, te := range resp.TransferEncoding {
		if te == "chunked" {
			// Chunked 不一定是 SSE，但在 AI API 上下文中通常意味着流式
			// 但有些普通大 JSON 也是 chunked。
			// 严格来说，只有 text/event-stream 才是我们需要特殊解析的流。
			// Vertex 的 JSON 流式通常是 application/json; charset=utf-8 但内容是 [ ... ]
		}
	}
	
	return false
}

// CheckBodyForStream 辅助函数：解析 Body JSON 检查 stream: true
// bodyBytes: 已经读取出来的 Body
func CheckBodyForStream(bodyBytes []byte) bool {
	if len(bodyBytes) == 0 {
		return false
	}
	// 简单快速匹配，避免完全 Unmarshal
	// 查找 "stream": true 或 "stream":true
	// 但要小心 "stream": false
	
	// 为了准确，还是 Unmarshal 一个 map
	var params map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &params); err == nil {
		if val, ok := params["stream"]; ok {
			if boolVal, ok := val.(bool); ok {
				return boolVal
			}
		}
	}
	return false
}
