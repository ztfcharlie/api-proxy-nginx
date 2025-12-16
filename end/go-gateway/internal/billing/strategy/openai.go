package strategy

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"

	"api-proxy/go-gateway/internal/billing"
)

type OpenAIStrategy struct{}

func (s *OpenAIStrategy) Name() string {
	return "openai"
}

// Calculate 处理非流式请求
func (s *OpenAIStrategy) Calculate(ctx context.Context, model string, reqBody []byte, resBody []byte, isStream bool, statusCode int) (*billing.UsageMetrics, error) {
	metrics := &billing.UsageMetrics{}

	// 1. 错误处理
	if statusCode >= 400 {
		return metrics, nil // 失败通常不计费 (除了某些特定错误，视策略而定)
	}

	// 2. 图片生成 (DALL-E)
	if strings.HasPrefix(model, "dall-e") {
		return s.calculateImage(reqBody, resBody)
	}

	// 3. 文本生成 (Chat/Completion)
	if isStream {
		// 流式计费比较特殊，通常在 ParseChunk 中累加
		// 如果这里被调用，说明可能是在 Post-Request 阶段做汇总
		// 暂时返回 nil，因为流式应该由 StreamParser 处理
		return metrics, nil
	}

	// 4. 标准文本响应 (JSON)
	var resp struct {
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(resBody, &resp); err != nil {
		return nil, err
	}

	metrics.InputTokens = resp.Usage.PromptTokens
	metrics.OutputTokens = resp.Usage.CompletionTokens
	metrics.TotalTokens = resp.Usage.TotalTokens
	return metrics, nil
}

func (s *OpenAIStrategy) calculateImage(reqBody, resBody []byte) (*billing.UsageMetrics, error) {
	metrics := &billing.UsageMetrics{}
	
	// 解析请求获取参数
	var req struct {
		N    int    `json:"n"`
		Size string `json:"size"`
		Quality string `json:"quality"`
	}
	// 默认值
	req.N = 1
	req.Size = "1024x1024"
	req.Quality = "standard"

	if len(reqBody) > 0 {
		_ = json.Unmarshal(reqBody, &req)
	}

	metrics.ImageCount = req.N
	metrics.ImageSize = req.Size
	metrics.ImageQuality = req.Quality
	return metrics, nil
}

// ParseChunk 实现 StreamParser 接口
func (s *OpenAIStrategy) ParseChunk(chunk []byte) (*billing.UsageMetrics, bool, error) {
	// OpenAI SSE 格式:
	// data: {"choices": [...], "usage": null} 

	// 最后一个 chunk 可能包含 usage:
	// data: {"choices": [], "usage": {"prompt_tokens":...}}
	
	metrics := &billing.UsageMetrics{}
	isDone := false
	
	// 简单分割 data:
	lines := bytes.Split(chunk, []byte("\n"))
	for _, line := range lines {
		line = bytes.TrimSpace(line)
		if !bytes.HasPrefix(line, []byte("data: ")) {
			continue
		}
		
		payload := bytes.TrimPrefix(line, []byte("data: "))
		if string(payload) == "[DONE]" {
			isDone = true
			continue
		}

		var partial struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				}
			}
			Usage *struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
				TotalTokens      int `json:"total_tokens"`
			} `json:"usage"`
		}

		if err := json.Unmarshal(payload, &partial); err != nil {
			continue
		}

		// 1. 如果有 Usage 字段 (Stream Options: include_usage)
		if partial.Usage != nil {
			metrics.InputTokens = partial.Usage.PromptTokens
			metrics.OutputTokens = partial.Usage.CompletionTokens
			metrics.TotalTokens = partial.Usage.TotalTokens
		} else {
			// 2. 如果没有 Usage，只能估算 (不推荐，但作为 fallback)
			// 使用 tiktoken 精确计算增量 content
			if len(partial.Choices) > 0 {
				content := partial.Choices[0].Delta.Content
				if content != "" {
					// 这里的 model 暂时拿不到，可以通过 struct 传入或者 Calculate 参数
					// 暂时默认 cl100k
					count := billing.GetTokenizer().CountTokens("gpt-3.5", content)
					metrics.OutputTokens += count
				}
			}
		}
	}

	return metrics, isDone, nil
}
