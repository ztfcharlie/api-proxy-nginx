package billing

import (
	"encoding/json"
	"strings"
)

// ParseSSEAndCount 解析 SSE 响应并计算 Token
func ParseSSEAndCount(rawSSE []byte, model string) (int, string) {
	fullContent := ""
	lines := strings.Split(string(rawSSE), "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		
		if !strings.HasPrefix(line, "data:") {
			continue
		}

		dataStr := strings.TrimPrefix(line, "data:")
		dataStr = strings.TrimSpace(dataStr)

		if dataStr == "[DONE]" {
			continue
		}

		// Try parsing JSON
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}

		if err := json.Unmarshal([]byte(dataStr), &chunk); err == nil {
			if len(chunk.Choices) > 0 {
				fullContent += chunk.Choices[0].Delta.Content
			}
		}
	}

	tokens := CountTextToken(fullContent, model)
	return tokens, fullContent
}
