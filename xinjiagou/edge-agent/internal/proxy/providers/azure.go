package providers

import (
	"edge-agent/internal/protocol"
	"net/http"
	"strings"
)

type AzureAdapter struct{}

func (a *AzureAdapter) RewriteRequest(req *http.Request, instance *protocol.InstanceConfig) error {
	// Azure Auth
	// Real lookup needed for key
	key := instance.ID 
	req.Header.Set("api-key", key)
	req.Header.Del("Authorization")

	// URL Rewrite
	// Instance.Endpoint should be: https://{resource}.openai.azure.com/openai/deployments/{deployment}
	// Request URL: /v1/chat/completions -> we need to map to /chat/completions?api-version=...
	
	// Remove "/v1" prefix if exists
	path := req.URL.Path
	if strings.HasPrefix(path, "/v1") {
		path = path[3:]
	}
	
	// Default Azure API Version (Should be config, but hardcode for MVP)
	query := req.URL.Query()
	if query.Get("api-version") == "" {
		query.Set("api-version", "2023-05-15")
	}
	req.URL.RawQuery = query.Encode()
	req.URL.Path = path
	
	// Host rewrite handled by worker using Instance.Endpoint as Base
	return nil
}

func (a *AzureAdapter) GetSniffer() Sniffer {
	// Azure Output format is same as OpenAI
	return &OpenAISniffer{}
}
