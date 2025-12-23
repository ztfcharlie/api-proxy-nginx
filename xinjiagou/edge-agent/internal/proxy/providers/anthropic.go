package providers

import (
	"bytes"
	"edge-agent/internal/keystore"
	"edge-agent/internal/protocol"
	"encoding/json"
	"fmt"
	"net/http"
)

type AnthropicAdapter struct{}

func (a *AnthropicAdapter) GetBaseURL(instance *protocol.InstanceConfig) string {
	return "https://api.anthropic.com"
}

func (a *AnthropicAdapter) RewriteRequest(req *http.Request, instance *protocol.InstanceConfig) error {
	key, ok := keystore.GlobalStore.Get(instance.ID)
	if !ok {
		return fmt.Errorf("credential not found for instance %s", instance.ID)
	}
	
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
	buf   bytes.Buffer
}

func (s *AnthropicSniffer) Write(p []byte) (n int, err error) {
	s.buf.Write(p)
	
	data := s.buf.Bytes()
	lastNewlineIndex := bytes.LastIndexByte(data, '\n')
	
	if lastNewlineIndex != -1 {
		toProcess := data[:lastNewlineIndex+1]
		lines := bytes.Split(toProcess, []byte("\n"))
		for _, line := range lines {
			s.processLine(line)
		}
		s.buf.Next(lastNewlineIndex + 1)
	}
	
	return len(p), nil
}

func (s *AnthropicSniffer) processLine(line []byte) {
	if !bytes.HasPrefix(line, []byte("data: ")) {
		return
	}
	
	data := line[6:]
	if len(data) == 0 { return }

	if !bytes.Contains(data, []byte(`"usage"`)) {
		return
	}

	var msg struct {
		Type  string `json:"type"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
		Message struct {
			Usage struct {
				InputTokens int `json:"input_tokens"`
			} `json:"usage"`
		} `json:"message"`
	}

	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}

	if msg.Message.Usage.InputTokens > 0 {
		s.usage.PromptTokens = msg.Message.Usage.InputTokens
	}
	if msg.Usage.OutputTokens > 0 {
		s.usage.CompletionTokens = msg.Usage.OutputTokens
	}
}

func (s *AnthropicSniffer) GetUsage() *protocol.Usage {
	return s.usage
}
