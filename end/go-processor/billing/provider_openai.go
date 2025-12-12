package billing

import (
	"encoding/json"
	"log"
	"strings"
)

type OpenAIProvider struct{}

// openAIResponse is shared within the billing package
type openAIResponse struct {
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func (s *OpenAIProvider) CanHandle(model string, path string) bool {
	// 粗略判断：OpenAI 官方模型通常以 gpt, text, dall-e 开头
	// 且路径通常包含 /v1/chat/completions
	isOpenAIModel := strings.HasPrefix(model, "gpt") || strings.HasPrefix(model, "text-") || strings.HasPrefix(model, "dall-e") || strings.HasPrefix(model, "o1-")
	isOpenAIPath := strings.Contains(path, "/v1/chat/completions") || strings.Contains(path, "/v1/embeddings")
	
	return isOpenAIModel && isOpenAIPath
}

func (s *OpenAIProvider) Calculate(model string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error) {
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

	// 如果 API 没返回 Usage (或者是旧版流式)，则进行本地计算
	if !foundUsage {
		log.Printf("[Billing] Usage missing for %s, calculating locally...", model)
		return s.estimateTokens(model, reqBody, resBody, isStream)
	}

	return u, nil
}

func (s *OpenAIProvider) estimateTokens(model string, reqBody, resBody []byte, isStream bool) (Usage, error) {
	var u Usage
	
	// 1. Calculate Prompt Tokens
	type chatRequest struct {
		Messages []map[string]interface{} `json:"messages"` // Use map for flexibility
	}
	var req chatRequest
	if err := json.Unmarshal(reqBody, &req); err == nil {
		u.PromptTokens = CountMessageTokens(req.Messages, model)
	} else {
		// Fallback: raw text count
		u.PromptTokens = CountTextToken(string(reqBody), model)
	}

	// 2. Calculate Completion Tokens
	if isStream {
		// Use our ported stream parser
		tokens, _ := ParseSSEAndCount(resBody, model)
		u.CompletionTokens = tokens
	} else {
		// Regular JSON
		var resp openAIResponse
		if err := json.Unmarshal(resBody, &resp); err == nil && len(resp.Choices) > 0 {
			content := resp.Choices[0].Message.Content
			u.CompletionTokens = CountTextToken(content, model)
		} else {
			// Fallback: raw text count
			u.CompletionTokens = CountTextToken(string(resBody), model)
		}
	}

	u.TotalTokens = u.PromptTokens + u.CompletionTokens
	return u, nil
}
