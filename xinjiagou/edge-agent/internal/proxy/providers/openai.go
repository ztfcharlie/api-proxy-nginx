package providers

import (
	"bytes"
	"edge-agent/internal/keystore"
	"edge-agent/internal/protocol"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type OpenAIAdapter struct{}

func (a *OpenAIAdapter) GetBaseURL(instance *protocol.InstanceConfig) string {
	return "https://api.openai.com"
}

func (a *OpenAIAdapter) RewriteRequest(req *http.Request, instance *protocol.InstanceConfig) error {
	// Lookup key from secure storage
	key, ok := keystore.GlobalStore.Get(instance.ID)
	if !ok {
		return fmt.Errorf("credential not found for instance %s", instance.ID)
	}
	
	req.Header.Set("Authorization", "Bearer "+key)
	
	// OpenAI 可能会校验 Host 头
	req.Host = req.URL.Host
	return nil
}

func (a *OpenAIAdapter) GetSniffer() Sniffer {
	return &OpenAISniffer{}
}

// --- Sniffer ---

type OpenAISniffer struct {
	usage *protocol.Usage
	buf   bytes.Buffer 
}

func (s *OpenAISniffer) Write(p []byte) (n int, err error) {
	s.buf.Write(p)
	
	data := s.buf.Bytes()
	lastNewlineIndex := bytes.LastIndexByte(data, '\n')
	
	if lastNewlineIndex != -1 {
		toProcess := data[:lastNewlineIndex+1]
		// Process lines
		lines := bytes.Split(toProcess, []byte("\n"))
		for _, line := range lines {
			if len(line) > 0 {
				s.processLine(line)
			}
		}
		// Consumes processed bytes
		s.buf.Next(lastNewlineIndex + 1)
	}
	
	if s.buf.Len() > 1024*1024 {
		// Safety: prevent infinite buffer growth if no newline found
		// Keep last 4KB to avoid cutting in the middle of a keyword?
		// No, if we have >1MB without a newline, something is wrong or it's a huge binary blob.
		// Just truncate to save memory.
		// Better strategy: discard first half.
		remaining := s.buf.Bytes()
		if len(remaining) > 4096 {
			// Keep tail
			newBuf := bytes.NewBuffer(remaining[len(remaining)-4096:])
			s.buf = *newBuf
		} else {
			s.buf.Reset()
		}
	}
	
	return len(p), nil
}

func (s *OpenAISniffer) processLine(line []byte) {
	if !bytes.HasPrefix(line, []byte("data: ")) {
		return
	}
	
	// Trim "data: "
	data := line[6:]
	
	if bytes.Equal(data, []byte("[DONE]")) {
		return
	}
	
	if bytes.Contains(data, []byte(`"usage"`)) {
		s.tryParseUsage(data)
	}
}

func (s *OpenAISniffer) tryParseUsage(p []byte) {
	// P should be a valid JSON object or close to it
	// data: {...}
	
	// Find usage block
	str := string(p)
	idx := strings.Index(str, `"usage":`)
	if idx == -1 { return }
	
	jsonStr := str[idx+8:] 
	
	// Find matching brace for usage object
	// Simple counter approach
	braceCount := 0
	endIdx := -1
	for i, r := range jsonStr {
		if r == '{' { braceCount++ }
		if r == '}' {
			braceCount--
			if braceCount < 0 { // usage: { ... } -> braceCount starts at 0? No.
				// "usage": { ... }
				//          ^ start parsing here
				// If we start AFTER ':', braceCount is 0.
				// First char should be '{'.
				endIdx = i
				break
			}
		}
	}
	
	if endIdx != -1 {
		jsonStr = jsonStr[:endIdx+1]
	} else {
		return
	}
	
	// If simple scan fails, try to unmarshal the whole line (safer)
	var msg struct {
		Usage *protocol.Usage `json:"usage"`
	}
	if err := json.Unmarshal(p, &msg); err == nil && msg.Usage != nil {
		s.usage = msg.Usage
	}
}

func (s *OpenAISniffer) GetUsage() *protocol.Usage {
	return s.usage
}
