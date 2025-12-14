package billing

import (
	"encoding/json"
	"strings"
)

type VertexProvider struct{}

func (s *VertexProvider) CanHandle(model string, path string) bool {
	// Google Vertex AI: /v1/projects/.../models/...:streamGenerateContent
	return strings.Contains(path, "/publishers/google/models/")
}

func (s *VertexProvider) Calculate(model string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error) {
	var u Usage
	if statusCode != 200 {
		return u, nil
	}

	// Vertex Response Format (simplified)
	// {"usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 20, "totalTokenCount": 30}}
	type vertexResp struct {
		UsageMetadata struct {
			PromptTokenCount     int `json:"promptTokenCount"`
			CandidatesTokenCount int `json:"candidatesTokenCount"`
			TotalTokenCount      int `json:"totalTokenCount"`
		} `json:"usageMetadata"`
	}

	var resp vertexResp
	// Note: Vertex stream response is complex (array of chunks). 
	// Assuming non-stream or aggregated response for simplicity here.
	if err := json.Unmarshal(resBody, &resp); err == nil {
		u.PromptTokens = resp.UsageMetadata.PromptTokenCount
		u.CompletionTokens = resp.UsageMetadata.CandidatesTokenCount
		u.TotalTokens = resp.UsageMetadata.TotalTokenCount
	}

	return u, nil
}

func (s *VertexProvider) CheckTaskStatus(resBody []byte) (string, string, error) {
	return "", "", nil
}