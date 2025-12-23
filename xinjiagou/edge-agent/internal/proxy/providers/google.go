package providers

import (
	"bytes"
	"context"
	"edge-agent/internal/keystore"
	"edge-agent/internal/protocol"
	"fmt"
	"net/http"
	"strings"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"sync"
)

type GoogleAdapter struct{
	// Cache for TokenSources to avoid parsing JSON and signing JWT on every request
	// Key: InstanceID, Value: oauth2.TokenSource
	tokenSources sync.Map 
}

func (a *GoogleAdapter) GetBaseURL(instance *protocol.InstanceConfig) string {
	isVertex := false
	for _, tag := range instance.Tags {
		if tag == "vertex" { isVertex = true; break }
	}
	if isVertex {
		return "https://us-central1-aiplatform.googleapis.com"
	}
	return "https://generativelanguage.googleapis.com"
}

func (a *GoogleAdapter) RewriteRequest(req *http.Request, instance *protocol.InstanceConfig) error {
	secret, ok := keystore.GlobalStore.Get(instance.ID)
	if !ok {
		return fmt.Errorf("credential not found for instance %s", instance.ID)
	}

	isVertex := false
	for _, tag := range instance.Tags {
		if tag == "vertex" { isVertex = true; break }
	}

	if !isVertex {
		// AI Studio Logic (API Key)
		q := req.URL.Query()
		q.Set("key", secret) 
		req.URL.RawQuery = q.Encode()
		req.Header.Del("Authorization")
	} else {
		// Vertex Logic (OAuth2) with Caching
		var ts oauth2.TokenSource
		
		// Initialize new TokenSource logic wrapper
		createTS := func() oauth2.TokenSource {
			jsonKey := []byte(secret)
			creds, err := google.CredentialsFromJSON(context.Background(), jsonKey, "https://www.googleapis.com/auth/cloud-platform")
			if err != nil {
				return nil // Error handling in LoadOrStore? No, LoadOrStore can't handle error.
			}
			return creds.TokenSource
		}

		// Optimistic load
		if val, ok := a.tokenSources.Load(instance.ID); ok {
			ts = val.(oauth2.TokenSource)
		} else {
			// Create new
			newTS := createTS()
			if newTS == nil {
				return fmt.Errorf("failed to create token source")
			}
			// LoadOrStore
			actual, loaded := a.tokenSources.LoadOrStore(instance.ID, newTS)
			if loaded {
				// Use the one stored by another goroutine
				ts = actual.(oauth2.TokenSource)
			} else {
				// Use ours
				ts = newTS
			}
		}
		
		// This call is cached by oauth2 package. It only refreshes when expired.
		token, err := ts.Token()
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