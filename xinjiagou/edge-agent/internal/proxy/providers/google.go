package providers

import (
	"bytes"
	"context"
	"edge-agent/internal/protocol"
	"net/http"
	"strings"

	"golang.org/x/oauth2/google"
)

type GoogleAdapter struct{}

func (a *GoogleAdapter) RewriteRequest(req *http.Request, instance *protocol.InstanceConfig) error {
	isVertex := false
	for _, tag := range instance.Tags {
		if tag == "vertex" { isVertex = true; break }
	}

	if !isVertex {
		// AI Studio Logic (API Key)
		q := req.URL.Query()
		// instance.ID contains the API Key
		q.Set("key", instance.ID) 
		req.URL.RawQuery = q.Encode()
		req.Header.Del("Authorization")
	} else {
		// Vertex Logic (OAuth2)
		// Assume instance.ID contains the Service Account JSON content
		// In production, this should be looked up from a secure store
		jsonKey := []byte(instance.ID)
		
		// Authenticate
		creds, err := google.CredentialsFromJSON(context.Background(), jsonKey, "https://www.googleapis.com/auth/cloud-platform")
		if err != nil {
			return err
		}
		
		token, err := creds.TokenSource.Token()
		if err != nil {
			return err
		}
		
		req.Header.Set("Authorization", "Bearer " + token.AccessToken)
	}
	
	return nil
}

func (a *GoogleAdapter) GetSniffer() Sniffer {
	return &GoogleSniffer{usage: &protocol.Usage{}}
}

type GoogleSniffer struct {
	usage *protocol.Usage
}

func (s *GoogleSniffer) Write(p []byte) (n int, err error) {
	// Google returns a JSON Array. Usage in "usageMetadata"
	if bytes.Contains(p, []byte(`"usageMetadata"`)) {
		// Try to parse partial JSON
		str := string(p)
		idx := strings.Index(str, `"usageMetadata":`)
		if idx != -1 {
			// Extract {...}
			// Simplified parsing logic...
		}
	}
	return len(p), nil
}

func (s *GoogleSniffer) GetUsage() *protocol.Usage {
	return s.usage
}