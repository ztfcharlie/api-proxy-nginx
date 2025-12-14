package billing

import (
	"encoding/json"
	"strings"
)

type DeepSeekProvider struct{}

func (s *DeepSeekProvider) CanHandle(model string, path string) bool {
	return strings.Contains(model, "deepseek")
}

func (s *DeepSeekProvider) Calculate(model string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error) {
	var u Usage
	if statusCode != 200 {
		return u, nil
	}

	var resp openAIResponse
	if err := json.Unmarshal(resBody, &resp); err == nil {
		u.PromptTokens = resp.Usage.PromptTokens
		u.CompletionTokens = resp.Usage.CompletionTokens
		u.TotalTokens = resp.Usage.TotalTokens
		
		u.CacheReadTokens = resp.Usage.CacheHitTokens
		u.CacheCreationTokens = resp.Usage.CacheMissTokens
	}
	return u, nil
}

func (s *DeepSeekProvider) CheckTaskStatus(resBody []byte) (string, string, error) {
	return "", "", nil
}