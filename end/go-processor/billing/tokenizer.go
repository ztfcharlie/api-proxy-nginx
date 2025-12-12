package billing

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"log"
	"math"
	"strings"

	"github.com/tiktoken-go/tokenizer"
	_ "golang.org/x/image/webp" // Support webp decoding
)

// --- Structs adapted from NewAPI ---

type FileMeta struct {
	MimeType   string
	OriginData string // URL or Base64 string
	Detail     string // "low", "high", "auto"
}

// --- Constants & Enums ---

// Simplified model lists
var (
	ImageGenerationModels = []string{"dall-e-3", "dall-e-2", "gpt-image-1"}
	OpenAITextModels      = []string{"gpt-", "o1", "o3", "o4", "chatgpt"}
)

func isOpenAITextModel(modelName string) bool {
	modelName = strings.ToLower(modelName)
	for _, m := range OpenAITextModels {
		if strings.Contains(modelName, m) {
			return true
		}
	}
	return false
}

// --- Image Token Calculation (Ported from NewAPI) ---

func getImageToken(fileMeta *FileMeta, model string) (int, error) {
	if fileMeta == nil {
		return 0, fmt.Errorf("image meta is nil")
	}

	// Defaults for 4o/4.1/4.5 family
	baseTokens := 85
	tileTokens := 170

	lowerModel := strings.ToLower(model)

	// Patch-based models logic
	isPatchBased := false
	multiplier := 1.0
	switch {
	case strings.Contains(lowerModel, "gpt-4.1-mini") || strings.Contains(lowerModel, "gpt-5-mini"):
		isPatchBased = true
		multiplier = 1.62
	case strings.Contains(lowerModel, "gpt-4.1-nano") || strings.Contains(lowerModel, "gpt-5-nano"):
		isPatchBased = true
		multiplier = 2.46
	}

	if !isPatchBased {
		if strings.HasPrefix(lowerModel, "gpt-4o-mini") {
			baseTokens = 2833
			tileTokens = 5667
		} else if strings.HasPrefix(lowerModel, "o1") || strings.HasPrefix(lowerModel, "o3") {
			baseTokens = 75
			tileTokens = 150
		}
	}

	if fileMeta.Detail == "low" && !isPatchBased {
		return baseTokens, nil
	}
	if fileMeta.Detail == "auto" || fileMeta.Detail == "" {
		fileMeta.Detail = "high"
	}

	// Decode Image
	config, _, err := decodeImageData(fileMeta.OriginData)
	if err != nil {
		// Fallback for files or decode errors
		return baseTokens, nil // Return minimum tokens instead of error to keep billing going
	}

	width, height := config.Width, config.Height

	if isPatchBased {
		// 32x32 patch calculation
		ceilDiv := func(a, b int) int { return (a + b - 1) / b }
		rawPatchesW := ceilDiv(width, 32)
		rawPatchesH := ceilDiv(height, 32)
		rawPatches := rawPatchesW * rawPatchesH
		
		imageTokens := rawPatches
		if rawPatches > 1536 {
			// simplified scaling logic for brevity, assuming standard cap
			imageTokens = 1536
		}
		return int(math.Round(float64(imageTokens) * multiplier)), nil
	}

	// Tile-based calculation
	// 1. Fit within 2048x2048
	maxSide := math.Max(float64(width), float64(height))
	fitScale := 1.0
	if maxSide > 2048 {
		fitScale = 2048.0 / maxSide
	}
	fitW := float64(width) * fitScale
	fitH := float64(height) * fitScale

	// 2. Scale shortest side to 768
	minSide := math.Min(fitW, fitH)
	shortScale := 768.0 / minSide
	finalW := int(math.Round(fitW * shortScale))
	finalH := int(math.Round(fitH * shortScale))

	// 3. Count 512px tiles
	tilesW := (finalW + 512 - 1) / 512
	tilesH := (finalH + 512 - 1) / 512
	tiles := tilesW * tilesH

	return tiles*tileTokens + baseTokens, nil
}

func decodeImageData(data string) (image.Config, string, error) {
	// Handle Base64
	if strings.HasPrefix(data, "data:") {
		parts := strings.SplitN(data, ",", 2)
		if len(parts) == 2 {
			data = parts[1]
		}
	}
	// Decode
	reader := base64.NewDecoder(base64.StdEncoding, strings.NewReader(data))
	return image.DecodeConfig(reader)
}

// --- Text Token Calculation ---

// CountTextToken calculates tokens for a string using tiktoken
func CountTextToken(text string, model string) int {
	if text == "" {
		return 0
	}
	
	// Default to cl100k_base for most modern models
	encoding := "cl100k_base"
	if strings.Contains(model, "gpt-3.5") || strings.Contains(model, "gpt-4") {
		encoding = "cl100k_base"
	}
	// Add more mappings if needed (e.g. p50k_base for older models)

	tk, err := tokenizer.Get(tokenizer.Encoding(encoding))
	if err != nil {
		// Fallback to simple estimation if tokenizer fails
		log.Printf("[WARN] Tiktoken init failed: %v. Using estimation.", err)
		return estimateToken(text)
	}

	ids, _, err := tk.Encode(text)
	if err != nil {
		log.Printf("[WARN] Tiktoken encode failed: %v", err)
		return estimateToken(text)
	}
	return len(ids)
}

func estimateToken(text string) int {
	return int(float64(len(text)) * 0.25) // Rough estimate
}

// --- Request Parsing (Messages) ---

// CountMessageTokens counts tokens for a list of OpenAI messages
// Ported simplified logic
func CountMessageTokens(messages []map[string]interface{}, model string) int {
	tokens := 0
	
	// Base tokens per message (im_start, role, etc)
	tokensPerMessage := 3
	if strings.Contains(model, "gpt-3.5-turbo-0301") {
		tokensPerMessage = 4
	}

	for _, msg := range messages {
		tokens += tokensPerMessage
		
		// Content
		if content, ok := msg["content"]; ok {
			switch v := content.(type) {
			case string:
				tokens += CountTextToken(v, model)
			case []interface{}: // Multimodal content array
				for _, part := range v {
					p, ok := part.(map[string]interface{})
					if !ok { continue }
					
					typeVal, _ := p["type"].(string)
					if typeVal == "text" {
						if text, ok := p["text"].(string); ok {
							tokens += CountTextToken(text, model)
						}
					} else if typeVal == "image_url" {
						if img, ok := p["image_url"].(map[string]interface{}); ok {
							url, _ := img["url"].(string)
							detail, _ := img["detail"].(string)
							meta := &FileMeta{OriginData: url, Detail: detail}
							imgTokens, _ := getImageToken(meta, model)
							tokens += imgTokens
						}
					}
				}
			}
		}
		
		// Name
		if name, ok := msg["name"].(string); ok {
			tokens += CountTextToken(name, model)
			tokens += 1 // role name adjust
		}
	}

	tokens += 3 // reply primer
	return tokens
}
