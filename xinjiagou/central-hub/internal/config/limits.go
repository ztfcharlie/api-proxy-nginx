package config

// RequestLimits 定义请求体大小限制
var RequestLimits = map[string]int64{
	"default": 2 * 1024 * 1024, // 2MB
	
	// Vision Models (大图)
	"gpt-4-vision-preview": 20 * 1024 * 1024,
	"gemini-pro-vision":    20 * 1024 * 1024,
	"claude-3-opus":        10 * 1024 * 1024, // 长上下文
	
	// Image Generation (DALL-E)
	"dall-e-3": 50 * 1024 * 1024,
}

func GetLimit(model string) int64 {
	if limit, ok := RequestLimits[model]; ok {
		return limit
	}
	return RequestLimits["default"]
}
