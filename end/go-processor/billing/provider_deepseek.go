package billing

import (
	"encoding/json"
	"log"
	"strings"
)

type DeepSeekProvider struct{}

func (s *DeepSeekProvider) CanHandle(model string, path string) bool {
	return strings.Contains(model, "deepseek")
}

func (s *DeepSeekProvider) Calculate(model string, reqBody, resBody []byte, statusCode int) (Usage, error) {
	// DeepSeek 逻辑与 OpenAI 99% 相似
	// 但我们可以针对 DeepSeek 的 Cache Token 做特殊处理 (未来)
	
	var u Usage
	if statusCode != 200 || len(resBody) == 0 {
		return u, nil
	}

	bodyStr := string(resBody)
	isStream := strings.HasPrefix(strings.TrimSpace(bodyStr), "data:")
	
	foundUsage := false

	if isStream {
		// DeepSeek 的 Stream 结束时会发送包含 usage 的 chunk
		lines := strings.Split(bodyStr, "\n")
		for i := len(lines) - 1; i >= 0; i-- {
			line := strings.TrimSpace(lines[i])
			if strings.HasPrefix(line, "data:") && !strings.Contains(line, "[DONE]") {
				jsonPart := strings.TrimPrefix(line, "data:")
				var resp openAIResponse // 复用 OpenAI 结构体 (它是私有的，但在同一个包下可见)
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

	// DeepSeek 必须依赖厂商返回，因为 tiktoken 无法完美模拟 DeepSeek 的 tokenizer
	if !foundUsage {
		log.Printf("[Billing] DeepSeek usage missing for %s", model)
		// 暂不兜底，避免算错
	}

	return u, nil
}
