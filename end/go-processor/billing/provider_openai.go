package billing

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/pkoukk/tiktoken-go"
)

type OpenAIProvider struct{}

func (s *OpenAIProvider) CanHandle(model string, path string) bool {
	// 粗略判断：OpenAI 官方模型通常以 gpt, text, dall-e 开头
	// 且路径通常包含 /v1/chat/completions
	isOpenAIModel := strings.HasPrefix(model, "gpt") || strings.HasPrefix(model, "text-") || strings.HasPrefix(model, "dall-e") || strings.HasPrefix(model, "o1-")
	isOpenAIPath := strings.Contains(path, "/v1/chat/completions") || strings.Contains(path, "/v1/embeddings")
	
	return isOpenAIModel && isOpenAIPath
}

// ... struct definitions ...

func (s *OpenAIProvider) Calculate(model string, reqBody, resBody []byte, statusCode int) (Usage, error) {
    // ...
}

// estimateTokens method receiver update
func (s *OpenAIProvider) estimateTokens(model string, reqBody, resBody []byte) (Usage, error) {
    // ...
}
