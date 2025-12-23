package providers

import "strings"

func GetAdapter(provider string) Adapter {
	switch strings.ToLower(provider) {
	case "anthropic":
		return &AnthropicAdapter{}
	case "google":
		return &GoogleAdapter{}
	case "aws":
		return &AWSAdapter{}
	case "azure":
		return &AzureAdapter{}
	case "openai", "deepseek", "qwen":
		return &OpenAIAdapter{}
	// Future:
	// case "google": return &GoogleAdapter{}
	// case "aws": return &AWSAdapter{}
	default:
		return &OpenAIAdapter{} // Default fallback
	}
}
