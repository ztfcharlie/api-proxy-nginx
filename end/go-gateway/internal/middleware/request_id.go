package middleware

import (
	"encoding/json"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// RequestIDHeader 定义 Request ID 的响应头
const RequestIDHeader = "X-Request-ID"

// RequestID 中间件：生成唯一的请求 ID 并注入到 Context 和 Header 中
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. 尝试从请求头获取 Request ID (用于链路追踪)
		requestID := c.GetHeader(RequestIDHeader)

		// 2. 如果不存在，则生成一个新的 UUID
		if requestID == "" {
			requestID = uuid.New().String()
		}

		// 3. 将 Request ID 设置到 Context 中，方便后续获取
		c.Set("request_id", requestID)

		// 4. 将 Request ID 设置到响应头中
		c.Writer.Header().Set(RequestIDHeader, requestID)

		c.Next()
	}
}

// GetRequestID 从 Context 中获取 Request ID 的辅助函数
func GetRequestID(c *gin.Context) string {
	if v, exists := c.Get("request_id"); exists {
		if id, ok := v.(string); ok {
			return id
		}
	}
	return "unknown"
}

// [Modified] 从 URI 或 Body 中提取模型名称
func ExtractModelName(uri string, body []byte) string {
	// 1. 尝试从 Vertex 风格 URI 提取
	// /v1/projects/.../models/gemini-pro:streamGenerateContent
	if strings.Contains(uri, "/models/") {
		parts := strings.Split(uri, "/models/")
		if len(parts) > 1 {
			sub := parts[1]
			if idx := strings.Index(sub, ":"); idx != -1 {
				return sub[:idx]
			}
			return sub
		}
	}

	// 2. 尝试从 Body (OpenAI 风格) 提取
	// {"model": "gpt-4", ...}
	if len(body) > 0 {
		// 简单解析，避免完全 Unmarshal 带来的性能损耗
		// 使用 encoding/json 的 Tokenizer 或者简单的字符串查找
		// 这里为了准确性使用 Unmarshal 部分字段
		var payload struct {
			Model string `json:"model"`
		}
		// 忽略错误，如果不是 JSON 就不处理
		if err := json.Unmarshal(body, &payload); err == nil && payload.Model != "" {
			return payload.Model
		}
	}
	
	return "default"
}
