package billing

import (
	"encoding/json"
	"log"
	"strings"
)

type OpenAIProvider struct{}

// openAIResponse is shared within the billing package
type openAIResponse struct {
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func (s *OpenAIProvider) CanHandle(model string, path string) bool {
	// 粗略判断：OpenAI 官方模型通常以 gpt, text, dall-e, whisper, tts 开头
	// 且路径通常包含 /v1/chat, /v1/embeddings, /v1/audio
	isModelMatch := strings.HasPrefix(model, "gpt") || strings.HasPrefix(model, "text-") || 
		strings.HasPrefix(model, "dall-e") || strings.HasPrefix(model, "o1-") || 
		strings.HasPrefix(model, "whisper") || strings.HasPrefix(model, "tts")
		
	isPathMatch := strings.Contains(path, "/v1/chat/completions") || 
		strings.Contains(path, "/v1/embeddings") || 
		strings.Contains(path, "/v1/audio/") ||
		strings.Contains(path, "/v1/images/") ||
		strings.Contains(path, "/v1/video/") ||
		strings.Contains(path, "/v1/completions") ||
		strings.Contains(path, "/v1/audio/speech")
	
	return isModelMatch && isPathMatch
}

func (s *OpenAIProvider) Calculate(model string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error) {
	var u Usage
	if statusCode != 200 {
		return u, nil
	}
	
	// [Safe] Skip billing for empty requests (e.g. GET content, or ping)
	if len(reqBody) == 0 {
		return u, nil
	}

	// 1. Audio Input (Whisper) - Explicit check for audio path to avoid conflict with Image edits
	if strings.Contains(contentType, "multipart/form-data") && strings.Contains(model, "whisper") {
		fileData, filename, err := ParseFirstFile(reqBody, contentType)
		if err == nil {
			duration, err := GetAudioDuration(fileData, filename)
			if err == nil {
				u.AudioSeconds = duration
				return u, nil 
			}
		}
		return u, nil
	}

	// 2. Images (DALL-E) or Video (Sora) or Remix (Edits/Variations)
	// If model is missing in multipart (e.g. edits), we assume it's an image/video operation if it's not whisper.
	if strings.Contains(model, "dall-e") || strings.Contains(model, "sora") || 
       (strings.Contains(contentType, "multipart/form-data") && !strings.Contains(model, "whisper")) {
		
		type genReq struct {
			N        int `json:"n"`
			Duration int `json:"duration"`
		}
		var req genReq
		// If JSON
		if json.Unmarshal(reqBody, &req) == nil {
			u.Images = req.N
			if u.Images == 0 { u.Images = 1 }
			if req.Duration > 0 {
				u.VideoSeconds = float64(req.Duration)
			} else if strings.Contains(model, "sora") {
				u.VideoSeconds = 8.0 
			}
		} else {
			// Multipart (Edits/Variations) or Parse Fail
			// Default to 1 generation
			u.Images = 1
			if strings.Contains(model, "sora") {
				u.VideoSeconds = 8.0
			}
		}
		return u, nil
	}

	// 3. Text/Chat Handling (Standard + TTS + Embeddings)
	if len(resBody) == 0 {
		return u, nil
	}

	bodyStr := string(resBody)
	isStream := strings.HasPrefix(strings.TrimSpace(bodyStr), "data:")
	
	foundUsage := false

	if isStream {
		// Stream 模式下，Usage 通常在最后一个 data: chunk (OpenAI 官方支持 stream_options: {include_usage: true})
		// 格式: data: {"id":..., "usage": {...}}
		lines := strings.Split(bodyStr, "\n")
		for i := len(lines) - 1; i >= 0; i-- {
			line := strings.TrimSpace(lines[i])
			if strings.HasPrefix(line, "data:") && !strings.Contains(line, "[DONE]") {
				jsonPart := strings.TrimPrefix(line, "data:")
				var resp openAIResponse
				if err := json.Unmarshal([]byte(jsonPart), &resp); err == nil {
					if resp.Usage.TotalTokens > 0 {
						u.PromptTokens = resp.Usage.PromptTokens
						u.CompletionTokens = resp.Usage.CompletionTokens
						u.TotalTokens = resp.Usage.TotalTokens
						foundUsage = true
						break
					}
				}
			}
		}
	} else {
		// 非 Stream 模式
		var resp openAIResponse
		if err := json.Unmarshal(resBody, &resp); err == nil {
			if resp.Usage.TotalTokens > 0 {
				u.PromptTokens = resp.Usage.PromptTokens
				u.CompletionTokens = resp.Usage.CompletionTokens
				u.TotalTokens = resp.Usage.TotalTokens
				foundUsage = true
			}
		}
	}

	// 如果 API 没返回 Usage (或者是旧版流式)，则进行本地计算
	if !foundUsage {
		log.Printf("[Billing] Usage missing for %s, calculating locally...", model)
		return s.estimateTokens(model, reqBody, resBody, isStream)
	}

	return u, nil
}

func (s *OpenAIProvider) estimateTokens(model string, reqBody, resBody []byte, isStream bool) (Usage, error) {
	var u Usage
	
	// Generic Request Parser
	var req map[string]interface{}
	json.Unmarshal(reqBody, &req)

	// 1. Calculate Prompt Tokens
	if messages, ok := req["messages"].([]interface{}); ok {
		// Chat
		// Need to convert []interface{} to []map[string]interface{}
		msgs := make([]map[string]interface{}, len(messages))
		for i, m := range messages {
			if mv, ok := m.(map[string]interface{}); ok {
				msgs[i] = mv
			}
		}
		u.PromptTokens = CountMessageTokens(msgs, model)
	} else if input, ok := req["input"].(string); ok {
		// TTS / Embedding (String)
		u.PromptTokens = CountTextToken(input, model)
	} else if inputArr, ok := req["input"].([]interface{}); ok {
		// Embedding (Array of strings)
		for _, item := range inputArr {
			if s, ok := item.(string); ok {
				u.PromptTokens += CountTextToken(s, model)
			}
		}
	} else if prompt, ok := req["prompt"].(string); ok {
		// Legacy Completion (String)
		u.PromptTokens = CountTextToken(prompt, model)
	} else if promptArr, ok := req["prompt"].([]interface{}); ok {
		// Legacy Completion (Array)
		for _, item := range promptArr {
			if s, ok := item.(string); ok {
				u.PromptTokens += CountTextToken(s, model)
			}
		}
	} else {
		// Fallback
		u.PromptTokens = CountTextToken(string(reqBody), model)
	}

	// 2. Calculate Completion Tokens
	if isStream {
		tokens, _ := ParseSSEAndCount(resBody, model)
		u.CompletionTokens = tokens
	} else {
		// Regular JSON
		// Try parsing as Chat
		var resp openAIResponse
		if err := json.Unmarshal(resBody, &resp); err == nil && len(resp.Choices) > 0 {
			content := resp.Choices[0].Message.Content
			u.CompletionTokens = CountTextToken(content, model)
		} else {
			// Try parsing as Legacy Completion
			var legResp struct {
				Choices []struct {
					Text string `json:"text"`
				} `json:"choices"`
			}
			if err := json.Unmarshal(resBody, &legResp); err == nil && len(legResp.Choices) > 0 {
				u.CompletionTokens = CountTextToken(legResp.Choices[0].Text, model)
			} else {
				// TTS usually returns binary, so resBody is not JSON. 
				// For TTS, output tokens are 0 (or calculated by duration if needed, but OpenAI charges by input char).
				if strings.Contains(model, "tts") {
					u.CompletionTokens = 0
				} else {
					u.CompletionTokens = CountTextToken(string(resBody), model)
				}
			}
		}
	}

	u.TotalTokens = u.PromptTokens + u.CompletionTokens
	return u, nil
}
