package strategy

import (
	"context"
	"encoding/json"
	"strings"

	"api-proxy/go-gateway/internal/billing"
)

type VertexStrategy struct{}

func (s *VertexStrategy) Name() string {
	return "vertex"
}

func (s *VertexStrategy) Calculate(ctx context.Context, model string, reqBody, resBody []byte, isStream bool, statusCode int) (*billing.UsageMetrics, error) {
	metrics := &billing.UsageMetrics{}

	if statusCode >= 400 {
		return metrics, nil
	}

	// 1. 处理异步任务提交 (predictLongRunning)
	// 响应通常包含 "name": "projects/.../operations/..."
	if strings.Contains(string(resBody), "/operations/") {
		var opResp struct {
			Name string `json:"name"` // Operation ID
		}
		if err := json.Unmarshal(resBody, &opResp); err == nil && opResp.Name != "" {
			// 这是一个异步任务提交
			// 对于 Veo 等视频模型，可以在这里记录 RequestCount 或预扣费
			// 实际结算需要在轮询 Operation 状态为 Done 时进行 (需要 Async Task Tracker 支持)
			metrics.RequestCount = 1
			return metrics, nil
		}
	}

	// 2. 处理流式 (Stream)
	if isStream {
		// Vertex 流式返回的是 JSON 数组的片段: [{...}, {...}]
		// ParseChunk 会处理，这里如果是 Post-Process 且有完整 Body，可以尝试解析整个数组
		// 但通常 Body 是截断的，所以这里不做处理，依赖 ParseChunk
		return metrics, nil
	}

	// 3. 处理标准响应 (Unary)
	var resp struct {
		UsageMetadata struct {
			PromptTokenCount     int `json:"promptTokenCount"`
			CandidatesTokenCount int `json:"candidatesTokenCount"`
			TotalTokenCount      int `json:"totalTokenCount"`
		} `json:"usageMetadata"`
	}

	if err := json.Unmarshal(resBody, &resp); err != nil {
		return nil, err
	}

	metrics.InputTokens = resp.UsageMetadata.PromptTokenCount
	metrics.OutputTokens = resp.UsageMetadata.CandidatesTokenCount
	metrics.TotalTokens = resp.UsageMetadata.TotalTokenCount

	return metrics, nil
}

// ParseChunk 实现流式解析
func (s *VertexStrategy) ParseChunk(chunk []byte) (*billing.UsageMetrics, bool, error) {
	metrics := &billing.UsageMetrics{}
	isDone := false

	// Vertex 流式 chunk 通常是一个 JSON 对象，或者是数组的一部分
	// 格式: [{ "candidates": [...], "usageMetadata": {...} }]
	// 或者是逗号分隔的对象
	
	cleanChunk := strings.TrimSpace(string(chunk))
	if strings.HasPrefix(cleanChunk, ",") {
		cleanChunk = cleanChunk[1:]
	}
	if strings.HasPrefix(cleanChunk, "[") {
		cleanChunk = cleanChunk[1:]
	}
	if strings.HasSuffix(cleanChunk, "]") {
		cleanChunk = cleanChunk[:len(cleanChunk)-1]
		isDone = true
	}

	var partial struct {
		UsageMetadata *struct {
			PromptTokenCount     int `json:"promptTokenCount"`
			CandidatesTokenCount int `json:"candidatesTokenCount"`
			TotalTokenCount      int `json:"totalTokenCount"`
		} `json:"usageMetadata"`
	}

	if err := json.Unmarshal([]byte(cleanChunk), &partial); err == nil {
		if partial.UsageMetadata != nil {
			// Vertex 通常在最后一个 chunk 返回完整的 usageMetadata
			metrics.InputTokens = partial.UsageMetadata.PromptTokenCount
			metrics.OutputTokens = partial.UsageMetadata.CandidatesTokenCount
			metrics.TotalTokens = partial.UsageMetadata.TotalTokenCount
		}
	}

	return metrics, isDone, nil
}
