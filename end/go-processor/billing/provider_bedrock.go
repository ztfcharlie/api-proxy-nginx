package billing

import (
	"encoding/json"
	"strings"
)

type BedrockProvider struct{}

func (s *BedrockProvider) CanHandle(model string, path string) bool {
	return strings.Contains(path, "/invoke") || strings.Contains(path, "/invoke-with-response-stream")
}

// Bedrock Titan/Claude Body 结构差异巨大
// 但我们主要关注 Amazon 的 token 统计
// 对于 Claude on Bedrock，它返回的格式其实包含 usage

type bedrockClaudeResponse struct {
	// 针对 Claude on Bedrock
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

type bedrockTitanResponse struct {
	InputTokenCount  int `json:"inputTextTokenCount"`
	OutputTokenCount int `json:"resultsTokenCount"`
}

func (s *BedrockProvider) Calculate(model string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error) {
	var u Usage
	if statusCode != 200 || len(resBody) == 0 {
		return u, nil
	}

	// Bedrock 模型太多，格式不一。
	// 优先尝试 Claude 格式 (最贵，也是主要场景)
	
	// 1. 尝试 Claude 格式
	var claudeResp bedrockClaudeResponse
	if err := json.Unmarshal(resBody, &claudeResp); err == nil {
		if claudeResp.Usage.InputTokens > 0 {
			u.PromptTokens = claudeResp.Usage.InputTokens
			u.CompletionTokens = claudeResp.Usage.OutputTokens
			u.TotalTokens = u.PromptTokens + u.CompletionTokens
			return u, nil
		}
	}

	// 2. 尝试 Titan 格式
	var titanResp bedrockTitanResponse
	if err := json.Unmarshal(resBody, &titanResp); err == nil {
		if titanResp.InputTokenCount > 0 {
			u.PromptTokens = titanResp.InputTokenCount
			u.CompletionTokens = titanResp.OutputTokenCount
			u.TotalTokens = u.PromptTokens + u.CompletionTokens
			return u, nil
		}
	}

	// 流式处理 (Bedrock EventStream 是二进制格式的，直接解析 text 很难)
	// 如果是流式，且我们拿不到 Header，Bedrock 计费会很困难。
	// 建议：对于 Bedrock，务必在 Nginx Lua 层抓取 `x-amzn-bedrock-invocation-metrics` header。
	
	return u, nil
}
