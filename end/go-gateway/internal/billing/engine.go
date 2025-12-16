package billing

import (
	"context"
	"strings"
)

type Engine struct {
	strategies map[string]Strategy
}

func NewEngine() *Engine {
	return &Engine{
		strategies: make(map[string]Strategy),
	}
}

func (e *Engine) Register(s Strategy) {
	e.strategies[s.Name()] = s
}

func (e *Engine) GetStrategy(model string) Strategy {
	// 简单的路由逻辑
	// 实际可能需要更复杂的匹配，比如 "gpt-*" -> openai
	// 或者 "claude-*" -> anthropic
	
	if strings.HasPrefix(model, "gpt") || strings.HasPrefix(model, "dall-e") || strings.HasPrefix(model, "text-") {
		return e.strategies["openai"]
	}
	if strings.HasPrefix(model, "claude") {
		return e.strategies["anthropic"]
	}
	// Vertex Models
	if strings.HasPrefix(model, "gemini") || strings.HasPrefix(model, "veo") || strings.HasPrefix(model, "imagen") {
		return e.strategies["vertex"]
	}
	
	// Default to OpenAI for compatibility
	return e.strategies["openai"]
}

// Calculate 统一入口
func (e *Engine) Calculate(ctx context.Context, model string, reqBody, resBody []byte, isStream bool, statusCode int) (*UsageMetrics, error) {
	strategy := e.GetStrategy(model)
	if strategy == nil {
		return &UsageMetrics{}, nil
	}
	return strategy.Calculate(ctx, model, reqBody, resBody, isStream, statusCode)
}
