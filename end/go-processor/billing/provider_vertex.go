package billing

import (
	"encoding/json"
	"strings"
)

type VertexProvider struct{}

func (s *VertexProvider) CanHandle(model string, path string) bool {
	// 识别 Google Vertex AI 的路径特征
	// 通常包含 /models/gemini-pro:generateContent 或 streamGenerateContent
	return strings.Contains(path, ":generateContent") || 
	       strings.Contains(path, ":streamGenerateContent") || 
	       strings.Contains(path, ":predict")
}

// Vertex 响应结构 (简化版)
type vertexResponse struct {
	UsageMetadata struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
		TotalTokenCount      int `json:"totalTokenCount"`
	} `json:"usageMetadata"`
}

func (s *VertexProvider) Calculate(model string, reqBody, resBody []byte, statusCode int) (Usage, error) {
	var u Usage
	if statusCode != 200 || len(resBody) == 0 {
		return u, nil
	}

	bodyStr := string(resBody)
	// Vertex AI 即使是 stream 模式，返回的也是 JSON 数组或者连续的 JSON 对象，而不是 SSE data:
	// 但如果是 HTTP/1.1 chunked transfer, 这里的 resBody 已经是拼接好的完整 body
	
	// 尝试直接解析 JSON
	// 注意：Vertex AI Stream 响应可能是 `[{...}, {...}]` 数组格式
	// 或者是连续的 JSON 对象（如果中间件没有处理好）。
	// 假设 resBody 是合法的 JSON (数组或对象)
	
	// 策略 1: 尝试解析为对象
	var respObj vertexResponse
	if err := json.Unmarshal(resBody, &respObj); err == nil {
		if respObj.UsageMetadata.TotalTokenCount > 0 {
			u.PromptTokens = respObj.UsageMetadata.PromptTokenCount
			u.CompletionTokens = respObj.UsageMetadata.CandidatesTokenCount
			u.TotalTokens = respObj.UsageMetadata.TotalTokenCount
			return u, nil
		}
	}
	
	// 策略 2: 尝试解析为数组 (Stream 聚合后的结果)
	var respArr []vertexResponse
	if err := json.Unmarshal(resBody, &respArr); err == nil && len(respArr) > 0 {
		// Vertex 的 UsageMetadata 通常在最后一个 chunk 或者每个 chunk 都有但最后的是累加值
		// 我们取最后一个包含有效 Usage 的
		for i := len(respArr) - 1; i >= 0; i-- {
			if respArr[i].UsageMetadata.TotalTokenCount > 0 {
				u.PromptTokens = respArr[i].UsageMetadata.PromptTokenCount
				u.CompletionTokens = respArr[i].UsageMetadata.CandidatesTokenCount
				u.TotalTokens = respArr[i].UsageMetadata.TotalTokenCount
				return u, nil
			}
		}
	}
	
	return u, nil
}
