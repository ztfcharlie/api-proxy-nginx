package providers

import (
	"bytes"
	"edge-agent/internal/protocol"
	"encoding/json"
	"net/http"
)

type AnthropicAdapter struct{}

func (a *AnthropicAdapter) RewriteRequest(req *http.Request, instance *protocol.InstanceConfig) error {
	key := instance.ID // Real lookup needed
	req.Header.Set("x-api-key", key)
	req.Header.Set("anthropic-version", "2023-06-01") // 必须带版本号
	req.Header.Del("Authorization") // 清理掉 OpenAI 的头
	return nil
}

func (a *AnthropicAdapter) GetSniffer() Sniffer {
	return &AnthropicSniffer{usage: &protocol.Usage{}}
}

type AnthropicSniffer struct {
	usage *protocol.Usage
}

func (s *AnthropicSniffer) Write(p []byte) (n int, err error) {
	// Claude SSE events:
	// event: message_start -> data: {..., "usage": {"input_tokens": 10}}
	// event: message_delta -> data: {..., "usage": {"output_tokens": 5}}
	
	chunks := bytes.Split(p, []byte("\n"))
	for _, chunk := range chunks {
		if !bytes.HasPrefix(chunk, []byte("data: ")) {
			continue
		}
		
		data := chunk[6:] // remove "data: "
		if len(data) == 0 { continue }

		// Optimization: Check if "usage" exists before Unmarshal
		if !bytes.Contains(data, []byte(`"usage"`)) {
			continue
		}

		var msg struct {
			Type  string `json:"type"`
			Usage struct {
				InputTokens  int `json:"input_tokens"`
				OutputTokens int `json:"output_tokens"`
			} `json:"usage"`
			Message struct { // message_start 里面包了一层
				Usage struct {
					InputTokens int `json:"input_tokens"`
				} `json:"usage"`
			} `json:"message"`
		}

		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		// 累加 Input (通常在 message_start)
		if msg.Message.Usage.InputTokens > 0 {
			s.usage.PromptTokens = msg.Message.Usage.InputTokens
		}
		// 累加 Output (通常在 message_delta)
		if msg.Usage.OutputTokens > 0 {
			s.usage.CompletionTokens = msg.Usage.OutputTokens
		}
	}
	
	return len(p), nil
}

func (s *AnthropicSniffer) GetUsage() *protocol.Usage {
	return s.usage
}
