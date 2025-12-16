package billing

import (
	"log"
	"strings"
	"sync"

	"github.com/tiktoken-go/tokenizer"
)

// TokenizerWrapper 封装 tiktoken
type TokenizerWrapper struct {
	encoders map[string]tokenizer.Codec
	mu       sync.RWMutex
}

var globalTokenizer *TokenizerWrapper
var once sync.Once

func GetTokenizer() *TokenizerWrapper {
	once.Do(func() {
		globalTokenizer = &TokenizerWrapper{
			encoders: make(map[string]tokenizer.Codec),
		}
	})
	return globalTokenizer
}

// GetCodec 获取指定模型的编码器
func (t *TokenizerWrapper) GetCodec(model string) tokenizer.Codec {
	// 归一化模型名称
	encoding := tokenizer.Cl100kBase // 默认 GPT-4/3.5
	if strings.HasPrefix(model, "gpt-4") || strings.HasPrefix(model, "gpt-3.5") {
		encoding = tokenizer.Cl100kBase
	} else if strings.HasPrefix(model, "text-davinci") {
		encoding = tokenizer.P50kBase
	}
	// TODO: Add support for other models like Claude/Gemini if needed (or map them to cl100k for approximation)

	t.mu.RLock()
	codec, exists := t.encoders[string(encoding)]
	t.mu.RUnlock()

	if exists {
		return codec
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	// Double check
	if codec, exists := t.encoders[string(encoding)]; exists {
		return codec
	}

	enc, err := tokenizer.Get(encoding)
	if err != nil {
		log.Printf("[Tokenizer] Failed to load encoding %s: %v, falling back to cl100k_base", encoding, err)
		enc, _ = tokenizer.Get(tokenizer.Cl100kBase)
	}
	t.encoders[string(encoding)] = enc
	return enc
}

// CountTokens 计算字符串的 Token 数
func (t *TokenizerWrapper) CountTokens(model, text string) int {
	if text == "" {
		return 0
	}
	enc := t.GetCodec(model)
	ids, _, _ := enc.Encode(text)
	return len(ids)
}
