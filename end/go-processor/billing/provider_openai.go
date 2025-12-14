package billing

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
)

type OpenAIProvider struct{}

func (s *OpenAIProvider) CanHandle(model string, path string) bool {
	// 粗略判断：OpenAI 官方模型通常以 gpt, text, dall-e, whisper, tts 开头
	// 且路径通常包含 /v1/chat, /v1/embeddings, /v1/audio
	isModelMatch := strings.HasPrefix(model, "gpt") || strings.HasPrefix(model, "text-") || 
		strings.HasPrefix(model, "dall-e") || strings.HasPrefix(model, "o1-") || 
		strings.HasPrefix(model, "whisper") || strings.HasPrefix(model, "tts") ||
		strings.HasPrefix(model, "sora")
		
	isOpenAIPath := strings.Contains(path, "/v1/chat/completions") || 
		strings.Contains(path, "/v1/embeddings") || 
		strings.Contains(path, "/v1/audio/") ||
		strings.Contains(path, "/v1/images/") ||
		strings.Contains(path, "/v1/video/") ||
		strings.Contains(path, "/v1/videos") ||
		strings.Contains(path, "/v1/completions") ||
		strings.Contains(path, "/v1/responses")
	
	return isModelMatch && isOpenAIPath
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

	// [Debug] Detailed logging
	log.Printf("[Billing DEBUG] Calculate model=%s, CT=%s, BodyLen=%d", model, contentType, len(reqBody))

	// 1. Audio Input (Whisper) - Explicit check for audio path to avoid conflict with Image edits
	if strings.Contains(contentType, "multipart/form-data") && strings.Contains(model, "whisper") {
		fileData, filename, err := ParseFirstFile(reqBody, contentType)
		if err == nil {
			duration, err := GetAudioDuration(fileData, filename)
			if err == nil {
				log.Printf("[Billing] Audio duration: %.2fs (file: %s)", duration, filename)
				u.AudioSeconds = duration
				return u, nil 
			} else {
				log.Printf("[Billing] Failed to get audio duration: %v", err)
			}
		} else {
			log.Printf("[Billing] Failed to parse multipart file: %v", err)
		}
		return u, nil
	}

	// 2. Images (DALL-E) or Video (Sora) or Remix (Edits/Variations)
	if strings.Contains(model, "dall-e") || strings.Contains(model, "sora") || 
       (strings.Contains(contentType, "multipart/form-data") && !strings.Contains(model, "whisper")) {
		
		// [Optimization] Try to read actual usage from Response first (Especially for Sora Remix)
		var respSora struct {
			Model   string      `json:"model"`
			Size    string      `json:"size"`
			Seconds interface{} `json:"seconds"` // OpenAI returns string "8", Mock might return int
		}
		if json.Unmarshal(resBody, &respSora) == nil && strings.Contains(respSora.Model, "sora") {
			// Extract Seconds
			sec := 0
			if v, ok := respSora.Seconds.(float64); ok {
				sec = int(v)
			} else if v, ok := respSora.Seconds.(string); ok {
				fmt.Sscanf(v, "%d", &sec)
			}
			
			u.Images = 1
			u.VideoSeconds = calculateSoraSeconds(respSora.Size, sec)
			return u, nil
		}

		type genReq struct {
			N       int    `json:"n"`
			Seconds int    `json:"seconds"`
			Quality string `json:"quality"`
			Size    string `json:"size"`
		}
		var req genReq
		// If JSON
		if json.Unmarshal(reqBody, &req) == nil {
			count := req.N
			if count == 0 { count = 1 }
			
			// DALL-E 3 Dynamic Pricing Multiplier
			multiplier := 1
			if strings.Contains(model, "dall-e-3") {
				isHD := req.Quality == "hd"
				isLarge := req.Size == "1024x1792" || req.Size == "1792x1024"
				
				if isHD { multiplier += 1 }
				if isLarge { multiplier += 1 }
			}
			
			u.Images = count * multiplier

			// Sora Dynamic Pricing
			if strings.Contains(model, "sora") {
				u.VideoSeconds = calculateSoraSeconds(req.Size, req.Seconds)
			}
		} else {
			// Multipart or Parse Fail -> Default to 1 generation
			u.Images = 1
			
			// Try to parse multipart fields for Sora params
			fields, err := ParseMultipartFields(reqBody, contentType)
			if err == nil {
				// Parse 'n'
				if val, ok := fields["n"]; ok {
					var n int
					if _, err := fmt.Sscanf(val, "%d", &n); err == nil && n > 0 {
						u.Images = n
					}
				}
				
				// Parse Sora specific fields
				if strings.Contains(model, "sora") {
					seconds := 0
					if val, ok := fields["seconds"]; ok {
						fmt.Sscanf(val, "%d", &seconds)
					}
					
					sizeVal := ""
					if val, ok := fields["size"]; ok { sizeVal = val }
					
					u.VideoSeconds = calculateSoraSeconds(sizeVal, seconds)
				}
			} else {
				// If multipart parse fails, fallback to defaults
				if strings.Contains(model, "sora") {
					u.VideoSeconds = calculateSoraSeconds("", 0) // Default 4s
				}
			}
		}
		return u, nil
	}

	// 3. Text/Chat Handling (Standard + TTS + Embeddings + Responses)
	if len(resBody) == 0 {
		return u, nil
	}

	// [Optimization] Try to read 'usage' from response first
	type respUsage struct {
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}
	var ru respUsage
	// Only try if it looks like JSON
	if json.Unmarshal(resBody, &ru) == nil && ru.Usage.TotalTokens > 0 {
		u.PromptTokens = ru.Usage.PromptTokens
		u.CompletionTokens = ru.Usage.CompletionTokens
		u.TotalTokens = ru.Usage.TotalTokens
		return u, nil
	}

	// Fallback: Estimate tokens locally
	bodyStr := string(resBody)
	isStream := strings.HasPrefix(strings.TrimSpace(bodyStr), "data:")
	
	return s.estimateTokens(model, reqBody, resBody, isStream)
}

// calculateSoraSeconds determines the billable seconds based on duration and resolution multiplier
func calculateSoraSeconds(size string, seconds int) float64 {
	duration := 4.0
	if seconds > 0 {
		duration = float64(seconds)
	}
	
	multiplier := 1.0
	// 1080p (Pro) costs 5x base price ($0.50 vs $0.10)
	// Base is 720p (default)
	if size == "1024x1792" || size == "1792x1024" || size == "1920x1080" || size == "1080x1920" {
		multiplier = 5.0
	}
	
	return duration * multiplier
}

func (s *OpenAIProvider) estimateTokens(model string, reqBody, resBody []byte, isStream bool) (Usage, error) {
	var u Usage
	
	// Generic Request Parser
	var req map[string]interface{}
	json.Unmarshal(reqBody, &req)

	// 1. Calculate Prompt Tokens
	if messages, ok := req["messages"].([]interface{}); ok {
		// Chat
		msgs := make([]map[string]interface{}, len(messages))
		for i, m := range messages {
			if mv, ok := m.(map[string]interface{}); ok {
				msgs[i] = mv
			}
		}
		u.PromptTokens = CountMessageTokens(msgs, model)
	} else if input, ok := req["input"].(string); ok {
		// TTS (Characters) / Embedding (Tokens)
		if strings.Contains(model, "tts") {
			u.PromptTokens = len([]rune(input))
		} else {
			u.PromptTokens = CountTextToken(input, model)
		}
	} else if inputArr, ok := req["input"].([]interface{}); ok {
		// Embedding (Array of strings) OR Responses (Array of Messages)
		if len(inputArr) > 0 {
			if _, isString := inputArr[0].(string); isString {
				// Embedding: ["text1", "text2"]
				for _, item := range inputArr {
					if s, ok := item.(string); ok {
						if strings.Contains(model, "tts") {
							u.PromptTokens += len([]rune(s))
						} else {
							u.PromptTokens += CountTextToken(s, model)
						}
					}
				}
			} else if _, isMap := inputArr[0].(map[string]interface{}); isMap {
				// Responses: [{"role":...}, ...]
				msgs := make([]map[string]interface{}, len(inputArr))
				for i, item := range inputArr {
					if m, ok := item.(map[string]interface{}); ok {
						msgs[i] = m
					}
				}
				u.PromptTokens = CountMessageTokens(msgs, model)
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
		// Regular JSON - Manually parsing content if usage missing
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
				// Try parsing as Responses API (output field)
				var respOut struct {
					Output string `json:"output"`
				}
				if err := json.Unmarshal(resBody, &respOut); err == nil && respOut.Output != "" {
					u.CompletionTokens = CountTextToken(respOut.Output, model)
				} else {
					// TTS usually returns binary, completion is 0.
					if strings.Contains(model, "tts") {
						u.CompletionTokens = 0
					} else {
						u.CompletionTokens = CountTextToken(string(resBody), model)
					}
				}
			}
		}
	}

	u.TotalTokens = u.PromptTokens + u.CompletionTokens
	return u, nil
}