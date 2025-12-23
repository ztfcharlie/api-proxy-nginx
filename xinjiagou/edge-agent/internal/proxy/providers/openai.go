package providers

import (
	"bytes"
	"edge-agent/internal/protocol"
	"encoding/json"
	"net/http"
	"strings"
)

type OpenAIAdapter struct{}

func (a *OpenAIAdapter) RewriteRequest(req *http.Request, instance *protocol.InstanceConfig) error {
	// 标准 Bearer Token 鉴权
	// instance.ID 在这里假设就是 Key (或者 Key 存储在别处，这里为简化直接用 ID 模拟 Key)
	// 在真实场景中，你会有一个 KeyStore，通过 ID 查 Key。
	// 这里为了演示，我们假设 InstanceConfig 暂时还没传 Key 字段，
	// 我们需要修改 protocol.InstanceConfig 加上 Key 字段，或者这里先用 ID 代替。
	// *修正*: 为了不改动太多文件，我们假设 instance.ID 对应的真实 Key 需要从本地保险箱读取。
	// 这里暂时模拟：ID 就是 Key (测试方便)
	
	key := instance.ID // TODO: Replace with secure key lookup: keyring.Get(instance.ID)
	req.Header.Set("Authorization", "Bearer "+key)
	
	// OpenAI 可能会校验 Host 头
	req.Host = req.URL.Host
	return nil
}

func (a *OpenAIAdapter) GetSniffer() Sniffer {
	return &OpenAISniffer{}
}

// --- Sniffer ---

type OpenAISniffer struct {
	usage *protocol.Usage
	buf   bytes.Buffer // 暂存最后一段数据以解析 Usage
}

func (s *OpenAISniffer) Write(p []byte) (n int, err error) {
	// OpenAI 的 Usage 通常在流的最后，格式:
	// data: {"id":..., "choices":[], "usage": {...}}
	// data: [DONE]
	
	// 我们不需要缓存所有数据，只需要关注最后那部分。
	// 但为了简单，我们先简单的检查当前 chunk 是否包含 "usage"
	
	if bytes.Contains(p, []byte(`"usage"`)) {
		// 尝试解析
		s.tryParseUsage(p)
	}
	return len(p), nil
}

func (s *OpenAISniffer) tryParseUsage(p []byte) {
	// 这是一个非常粗糙的解析，生产环境应用更严谨的 SSE Parser
	// 寻找 "usage": { ... }
	str := string(p)
	idx := strings.Index(str, `"usage":`)
	if idx == -1 {
		return
	}
	
	// 截取 usage 之后的部分
	jsonStr := str[idx+8:] // skip "usage":
	
	// 简单寻找结束的大括号 (不严谨，但够用)
	endIdx := strings.Index(jsonStr, "}")
	if endIdx == -1 {
		return
	}
	jsonStr = jsonStr[:endIdx+1]
	
	var usage protocol.Usage
	if err := json.Unmarshal([]byte(jsonStr), &usage); err == nil {
		s.usage = &usage
	}
}

func (s *OpenAISniffer) GetUsage() *protocol.Usage {
	return s.usage
}
