package billing

import (
	"encoding/json"
	"log"
	"strings"
)

type QwenProvider struct{}

func (s *QwenProvider) CanHandle(model string, path string) bool {
	return strings.Contains(model, "qwen") || strings.Contains(model, "wanx")
}

func (s *QwenProvider) Calculate(model string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error) {
	var u Usage
	if statusCode != 200 || len(resBody) == 0 {
		return u, nil
	}

	bodyStr := string(resBody)
	isStream := strings.HasPrefix(strings.TrimSpace(bodyStr), "data:")
	
	foundUsage := false

	if isStream {
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

	if !foundUsage {
		log.Printf("[Billing] Qwen usage missing for %s", model)
		// Qwen 的 Tokenizer 开源了 (tiktoken 可以加载 qwen.tiktoken)，但这里先不集成，太重了。
	}

	return u, nil
}
