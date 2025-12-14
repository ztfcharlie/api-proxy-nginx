package billing

import (
	"encoding/json"
	"strings"
)

type QwenProvider struct{}

func (s *QwenProvider) CanHandle(model string, path string) bool {
	return strings.Contains(model, "qwen")
}

func (s *QwenProvider) Calculate(model string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error) {
	var u Usage
	if statusCode != 200 {
		return u, nil
	}

	var resp openAIResponse
	if err := json.Unmarshal(resBody, &resp); err == nil {
		u.PromptTokens = resp.Usage.PromptTokens
		u.CompletionTokens = resp.Usage.CompletionTokens
		u.TotalTokens = resp.Usage.TotalTokens
	}
	return u, nil
}

func (s *QwenProvider) CheckTaskStatus(resBody []byte) (string, string, error) {
	return "", "", nil
}