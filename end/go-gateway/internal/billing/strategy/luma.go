package strategy

import (
	"context"
	"encoding/json"

	"api-proxy/go-gateway/internal/billing"
)

type LumaStrategy struct{}

func (s *LumaStrategy) Name() string {
	return "luma"
}

func (s *LumaStrategy) Calculate(ctx context.Context, model string, reqBody, resBody []byte, isStream bool, statusCode int) (*billing.UsageMetrics, error) {
	metrics := &billing.UsageMetrics{}
	
	// 1. Check for Submission (POST /generations)
	// Response contains "id"
	// We might charge a deposit here.
	
	// 2. Check for Polling Result (GET /generations/{id})
	// Response contains "state": "completed", "video": { "duration": ... }
	
	var resp map[string]interface{}
	if err := json.Unmarshal(resBody, &resp); err != nil {
		return nil, err
	}
	
	state, _ := resp["state"].(string)
	if state == "completed" {
		// Calculate final cost
		if video, ok := resp["video"].(map[string]interface{}); ok {
			if duration, ok := video["duration"].(float64); ok {
				metrics.VideoSeconds = duration
				// Check resolution/quality if available
			}
		}
	} else if _, ok := resp["id"]; ok && statusCode == 201 {
		// Submission successful
		// Maybe charge a deposit?
		// For now, let's assume we bill ONLY on completion (simpler, but risky if user never polls)
		// Or we bill flat fee on submission.
		
		// If we return metrics here, the SettlementService will charge it.
	}
	
	return metrics, nil
}
