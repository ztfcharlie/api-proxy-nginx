package middleware

import (
	"bytes"
	"io"

	"api-proxy/go-gateway/internal/utils"

	"github.com/gin-gonic/gin"
)

const MaxBufferBytes = 1 * 1024 * 1024 // 1MB Limit for Non-Streaming Buffering

// ResponseCapture 响应拦截器
type ResponseCapture struct {
	gin.ResponseWriter
	Body       *bytes.Buffer
	StatusCode int
	IsStream   bool
}

func NewResponseCapture(w gin.ResponseWriter, isStream bool) *ResponseCapture {
	return &ResponseCapture{
		ResponseWriter: w,
		Body:           &bytes.Buffer{},
		StatusCode:     200, // Default
		IsStream:       isStream,
	}
}

func (w *ResponseCapture) Write(b []byte) (int, error) {
	// 拦截写入
	if !w.IsStream {
		if w.Body.Len()+len(b) < MaxBufferBytes {
			w.Body.Write(b)
		}
	} else {
		// 流式请求：
		// 这里我们仍然需要捕获数据用于计费，但不能无限缓冲。
		// 策略：
		// 1. 对于 OpenAI SSE，我们需要 ParseChunk。
		// 2. 这里我们先简单地将数据“透传”给一个（尚未实现的）StreamProcessor。
		//    目前为了跑通 BillingMiddleware，我们暂时把流式数据也 append 进去 (如果是短流)。
		//    但在生产环境，这里应该直接调用 parser.Parse(b) 并累加计数器，而不是存 Body。
		
		// 临时方案：只缓冲前 1MB 用于调试或短流，超过截断
		if w.Body.Len() < MaxBufferBytes {
			w.Body.Write(b)
		}
	}

	return w.ResponseWriter.Write(b)
}

func (w *ResponseCapture) WriteHeader(statusCode int) {
	w.StatusCode = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *ResponseCapture) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

// CaptureMiddleware 注册中间件
func CaptureMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Detect Streaming Request
		// We need to read the body to check for "stream": true
		var bodyBytes []byte
		if c.Request.Body != nil {
			bodyBytes, _ = io.ReadAll(c.Request.Body)
			// Restore Body
			c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
		}

		isStream := utils.IsStreamingRequest(c.Request)
		if !isStream && len(bodyBytes) > 0 {
			isStream = utils.CheckBodyForStream(bodyBytes)
		}

		// Store request body for later use (Billing)
		// WARNING: Storing large bodies in Context is memory intensive.
		c.Set("request_body", bodyBytes)
		c.Set("is_stream", isStream)

		// 2. Wrap Writer
		blw := NewResponseCapture(c.Writer, isStream)
		c.Writer = blw

		c.Next()

		// 3. Post-Process
		c.Set("response_body", blw.Body.Bytes())
		c.Set("response_status", blw.StatusCode)
	}
}
