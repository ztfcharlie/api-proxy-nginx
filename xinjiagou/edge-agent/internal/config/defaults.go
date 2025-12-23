package config

import "time"

// System Defaults (Developer Tunable)
const (
	// DefaultRequestTimeout is the HTTP client timeout for proxy requests.
	// Increased to 10 minutes for long-running LLM tasks (e.g. GPT-4-32k, Claude Opus).
	DefaultRequestTimeout = 600 * time.Second 
	
	// StreamWriteTimeout is the timeout for writing chunks to the WS stream.
	StreamWriteTimeout = 100 * time.Millisecond
)
