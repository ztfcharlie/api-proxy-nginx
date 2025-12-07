package billing

import (
	"fmt"
)

type Engine struct {
	strategies []Strategy
}

func NewEngine() *Engine {
	return &Engine{
		strategies: []Strategy{
			&OpenAIProvider{},
			&AzureProvider{},
			&AnthropicProvider{}, // Claude
			&VertexProvider{},    // Google
			&BedrockProvider{},   // AWS
			&DeepSeekProvider{},  // DeepSeek
			&QwenProvider{},      // Alibaba
		},
	}
}

// Calculate 自动选择策略并计算
func (e *Engine) Calculate(model string, path string, reqBody, resBody []byte, statusCode int) (Usage, error) {
	for _, s := range e.strategies {
		if s.CanHandle(model, path) {
			return s.Calculate(model, reqBody, resBody, statusCode)
		}
	}
	// 默认返回空，不报错，因为有些请求可能就是不计费的 (如 health check)
	return Usage{}, nil
}
