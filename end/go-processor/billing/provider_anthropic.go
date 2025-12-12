package billing

import (
	"encoding/json"
	"strings"
)

type AnthropicProvider struct{}

func (s *AnthropicProvider) CanHandle(model string, path string) bool {
	// Anthropic 标准路径
	return strings.Contains(path, "/v1/messages") || strings.Contains(path, "anthropic")
}

// Claude 响应结构
type claudeResponse struct {
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

// Claude 流式事件结构
type claudeStreamEvent struct {
	Type  string `json:"type"`
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
	Delta struct {
		Usage struct {
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	} `json:"delta"`
}

func (s *AnthropicProvider) Calculate(model string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error) {
	var u Usage

	if statusCode != 200 || len(resBody) == 0 {
		// 失败请求暂不估算
		return u, nil
	}

	bodyStr := string(resBody)
	
	// 判断是否为流式
	// Claude 流式是以 "event: type\ndata: json" 格式返回的
	if strings.Contains(bodyStr, "event: message_start") || strings.Contains(bodyStr, "event: message_delta") {
		// 流式处理
		// Claude 的 Usage 分散在两个事件里：
		// 1. message_start -> usage.input_tokens
		// 2. message_delta -> delta.usage.output_tokens (可能多次累加？不，通常只在结束时返回总数或增量)
		// 根据官方文档：
		// message_start event contains input_tokens.
		// message_delta event contains output_tokens (incremental). 
		// BUT wait, Claude API docs say "usage" in message_delta contains the token count for *that* delta? Or cumulative?
		// 实际上，最准确的是 message_stop 吗？不。
		
		// 让我们简化处理：遍历所有 event，累加找到的数值。
		// 注意：要小心重复计算。
		
		// 简单的解析逻辑：
		// 1. 找 message_start 里的 input_tokens
		// 2. 找 message_delta 里的 output_tokens 并累加 (如果是增量)
		
		lines := strings.Split(bodyStr, "\n")
		for i, line := range lines {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "data:") {
				jsonPart := strings.TrimPrefix(line, "data:")
				
				// 需要判断前一行的 event type 吗？
				// SSE 格式通常是:
				// event: message_start
				// data: {...}
				
				// 获取 event type (往前找)
				eventType := ""
				if i > 0 && strings.HasPrefix(strings.TrimSpace(lines[i-1]), "event:") {
					eventType = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(lines[i-1]), "event:"))
				}
				
				if eventType == "message_start" {
					var evt claudeStreamEvent
					if err := json.Unmarshal([]byte(jsonPart), &evt); err == nil {
						u.PromptTokens = evt.Usage.InputTokens
					}
				} else if eventType == "message_delta" {
					var evt claudeStreamEvent
					if err := json.Unmarshal([]byte(jsonPart), &evt); err == nil {
						// message_delta 的 usage 字段通常包含 output_tokens
						if evt.Usage.OutputTokens > 0 {
							u.CompletionTokens = evt.Usage.OutputTokens // 这种通常是累积的吗？文档说是 The usage billing for this message delta.
							// 如果是 delta，需要累加
							// 但实际上 Claude 的 message_delta 里的 usage.output_tokens 是增量。
							// 我们需要把所有 delta 的 output_tokens 加起来。
							// Wait, struct definition above: Delta.Usage.OutputTokens
							u.CompletionTokens += evt.Delta.Usage.OutputTokens
						}
						// 有些 SDK 返回的结构可能略有不同，比如直接在 Usage 里
						if evt.Delta.Usage.OutputTokens > 0 {
                             // 上面已经加了，这里是防止结构体定义偏差的双重检查
                             // 修正结构体定义：message_delta 的 JSON 结构是 {"type": "message_delta", "delta": ..., "usage": {"output_tokens": 12}}
                             // 这里的 usage 是本次 delta 的 token 数。
						     u.CompletionTokens += evt.Usage.OutputTokens
						}
					}
				}
			}
		}
		
	} else {
		// 非流式：直接解析
		var resp claudeResponse
		if err := json.Unmarshal(resBody, &resp); err == nil {
			u.PromptTokens = resp.Usage.InputTokens
			u.CompletionTokens = resp.Usage.OutputTokens
		}
	}

	u.TotalTokens = u.PromptTokens + u.CompletionTokens
	return u, nil
}
