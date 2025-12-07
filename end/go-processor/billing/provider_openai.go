package billing

import (
	"encoding/json"
	"log"
	"strings"

	"github.com/pkoukk/tiktoken-go"
)

type OpenAIProvider struct{}

// openAIResponse is shared within the billing package
type openAIResponse struct {
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

func (s *OpenAIProvider) CanHandle(model string, path string) bool {
	// 粗略判断：OpenAI 官方模型通常以 gpt, text, dall-e 开头
	// 且路径通常包含 /v1/chat/completions
	isOpenAIModel := strings.HasPrefix(model, "gpt") || strings.HasPrefix(model, "text-") || strings.HasPrefix(model, "dall-e") || strings.HasPrefix(model, "o1-")
	isOpenAIPath := strings.Contains(path, "/v1/chat/completions") || strings.Contains(path, "/v1/embeddings")
	
	return isOpenAIModel && isOpenAIPath
}

func (s *OpenAIProvider) Calculate(model string, reqBody, resBody []byte, statusCode int) (Usage, error) {
	var u Usage
	if statusCode != 200 || len(resBody) == 0 {
		return u, nil
	}

	bodyStr := string(resBody)
	isStream := strings.HasPrefix(strings.TrimSpace(bodyStr), "data:")
	
	foundUsage := false

	if isStream {
		// Stream 模式下，Usage 通常在最后一个 data: chunk (OpenAI 官方支持 stream_options: {include_usage: true})
		// 格式: data: {"id":..., "usage": {...}}
		lines := strings.Split(bodyStr, "\n")
		for i := len(lines) - 1; i >= 0; i-- {
			line := strings.TrimSpace(lines[i])
			if strings.HasPrefix(line, "data:") && !strings.Contains(line, "[DONE]") {
				jsonPart := strings.TrimPrefix(line, "data:")
				var resp openAIResponse
				if err := json.Unmarshal([]byte(jsonPart), &resp); err == nil {
					if resp.Usage.TotalTokens > 0 {
						u.PromptTokens = resp.Usage.PromptTokens
						u.CompletionTokens = resp.Usage.CompletionTokens
						u.TotalTokens = resp.Usage.TotalTokens
						foundUsage = true
						break
					}
				}
			}
		}
	} else {
		// 非 Stream 模式
		var resp openAIResponse
		if err := json.Unmarshal(resBody, &resp); err == nil {
			if resp.Usage.TotalTokens > 0 {
				u.PromptTokens = resp.Usage.PromptTokens
				u.CompletionTokens = resp.Usage.CompletionTokens
				u.TotalTokens = resp.Usage.TotalTokens
				foundUsage = true
			}
		}
	}

	// 如果 API 没返回 Usage (或者是旧版流式)，则进行估算
	if !foundUsage {
		log.Printf("[Billing] Usage missing for %s, estimating...", model)
		return s.estimateTokens(model, reqBody, resBody)
	}

	return u, nil
}

func (s *OpenAIProvider) estimateTokens(model string, reqBody, resBody []byte) (Usage, error) {
	var u Usage
	
	// 尝试加载 tokenizer
	tkm, err := tiktoken.EncodingForModel(model)
	if err != nil {
		// fallback
		tkm, _ = tiktoken.GetEncoding("cl100k_base")
	}

	// 简单的估算：Input
	// 这里的 reqBody 可能是 JSON，需要解析出 content
	// 为简化，直接计算整个 JSON string 的 token 可能会偏大，但作为兜底尚可
	// 或者尝试解析 JSON
	type chatRequest struct {
		Messages []struct {
			Content string `json:"content"`
		} `json:"messages"`
	}
	var req chatRequest
	if json.Unmarshal(reqBody, &req) == nil && len(req.Messages) > 0 {
		for _, msg := range req.Messages {
			u.PromptTokens += len(tkm.Encode(msg.Content, nil, nil))
		}
	} else {
		// 解析失败，直接算 string
		u.PromptTokens = len(tkm.Encode(string(reqBody), nil, nil))
	}

	// Output
	u.CompletionTokens = len(tkm.Encode(string(resBody), nil, nil))
	u.TotalTokens = u.PromptTokens + u.CompletionTokens

	return u, nil
}
