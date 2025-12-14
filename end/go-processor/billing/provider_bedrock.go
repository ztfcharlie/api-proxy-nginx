package billing

import (
	"encoding/json"
	"strings"
)

type BedrockProvider struct{}

func (s *BedrockProvider) CanHandle(model string, path string) bool {
	// AWS Bedrock: /model/{model_id}/invoke
	return strings.Contains(path, "/model/") && strings.Contains(path, "/invoke")
}

func (s *BedrockProvider) Calculate(model string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error) {
	var u Usage
	if statusCode != 200 {
		return u, nil
	}

	// Request: {"prompt": "..."}
	var req struct {
		Prompt string `json:"prompt"`
	}
	json.Unmarshal(reqBody, &req)
	u.PromptTokens = CountTextToken(req.Prompt, model)

	// Response: {"completion": "..."}
	var resp struct {
		Completion string `json:"completion"`
	}
	json.Unmarshal(resBody, &resp)
	u.CompletionTokens = CountTextToken(resp.Completion, model)

	u.TotalTokens = u.PromptTokens + u.CompletionTokens
	return u, nil
}

func (s *BedrockProvider) CheckTaskStatus(resBody []byte) (string, string, error) {
	return "", "", nil
}