package billing

import (
	"log"
	"strings"
)

type AzureProvider struct {
	// 可以在这里组合 OpenAIProvider 复用逻辑
	base OpenAIProvider
}

func (s *AzureProvider) CanHandle(model string, path string) bool {
	// Azure 的 Path 特征：包含 /openai/deployments/
	return strings.Contains(path, "/openai/deployments/")
}

func (s *AzureProvider) Calculate(model string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error) {
	// Azure 的响应体结构与 OpenAI 基本一致 (除了 Content Filter)
	// 我们可以直接复用 OpenAI 的逻辑，或者 copy 一份以防万一
	
	// 这里为了安全，我们使用 OpenAIProvider 的逻辑，但做一层封装
	usage, err := s.base.Calculate(model, reqBody, resBody, contentType, statusCode)
	if err != nil {
		return usage, err
	}
	
	// Azure 兜底逻辑
	if usage.TotalTokens == 0 {
		// Azure 通常非常规范，如果没 Usage 可能是 api-version 太老
		// 这里可以调用 base.estimateTokens (Azure 模型和 OpenAI 一样，tiktoken 适用)
		log.Printf("[Billing] Azure usage missing, estimating...")
		
		bodyStr := string(resBody)
		isStream := strings.HasPrefix(strings.TrimSpace(bodyStr), "data:")
		
		return s.base.estimateTokens(model, reqBody, resBody, isStream)
	}
	
	return usage, nil
}
