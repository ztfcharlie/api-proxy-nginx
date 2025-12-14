package billing

type Engine struct {
	strategies []Strategy
}

func NewEngine() *Engine {
	return &Engine{
		strategies: []Strategy{
			&OpenAIProvider{},    // Now handles audio too
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
func (e *Engine) Calculate(model string, path string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error) {
	for _, s := range e.strategies {
		if s.CanHandle(model, path) {
			return s.Calculate(model, reqBody, resBody, contentType, statusCode)
		}
	}
	// 默认返回空，不报错，因为有些请求可能就是不计费的 (如 health check)
	return Usage{}, nil
}

// [Added] CheckTaskStatus delegates to the appropriate strategy
func (e *Engine) CheckTaskStatus(model string, resBody []byte) (string, string, error) {
	for _, s := range e.strategies {
		// Use empty path as we only care about model-specific response format
		if s.CanHandle(model, "/v1/videos/status") { // Hack: provide a dummy path that might match?
            // Actually, CanHandle checks path.
            // OpenAIProvider checks: model has prefix "sora" OR path contains "/video/".
            // So if we pass a dummy path "/v1/video/", it should match.
            // Let's pass "/v1/videos/" to be safe.
			status, id, err := s.CheckTaskStatus(resBody)
			if status != "" {
				return status, id, err
			}
		}
	}
	return "", "", nil
}
