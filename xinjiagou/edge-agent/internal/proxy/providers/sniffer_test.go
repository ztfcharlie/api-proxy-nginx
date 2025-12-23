package providers

import (
	"testing"
)

// Mock OpenAI Stream Response with split packets
func TestOpenAISniffer_SplitPackets(t *testing.T) {
	sniffer := &OpenAISniffer{}
	
	// Data: data: {"usage": {"prompt_tokens": 5, "completion_tokens": 10}}\n\n
	// Split into tiny chunks
	fullData := []byte("data: {\"usage\": {\"prompt_tokens\": 5, \"completion_tokens\": 10}}\n\n")
	
	for i := 0; i < len(fullData); i++ {
		chunk := fullData[i : i+1] // 1 byte per write
		sniffer.Write(chunk)
	}
	
	usage := sniffer.GetUsage()
	if usage == nil {
		t.Fatal("Usage is nil")
	}
	
	if usage.PromptTokens != 5 {
		t.Errorf("Expected 5 prompt tokens, got %d", usage.PromptTokens)
	}
	if usage.CompletionTokens != 10 {
		t.Errorf("Expected 10 completion tokens, got %d", usage.CompletionTokens)
	}
}

func TestAnthropicSniffer_SplitPackets(t *testing.T) {
	adapter := GetAdapter("anthropic")
	sniffer := adapter.GetSniffer()
	
	// Data: 
	// event: message_start\ndata: {"message": {"usage": {"input_tokens": 10}}}\n\n
	// event: message_delta\ndata: {"usage": {"output_tokens": 5}}\n\n
	
	part1 := []byte("event: message_start\ndata: {\"message\": {\"usage\": {\"input_tokens\": 10}}}\n\n")
	part2 := []byte("event: message_delta\ndata: {\"usage\": {\"output_tokens\": 5}}\n\n")
	
	fullData := append(part1, part2...)
	
	// Write 1 byte at a time
	for i := 0; i < len(fullData); i++ {
		sniffer.Write(fullData[i : i+1])
	}
	
	usage := sniffer.GetUsage()
	if usage == nil {
		t.Fatal("Usage is nil")
	}
	
	if usage.PromptTokens != 10 {
		t.Errorf("Expected 10 input tokens, got %d", usage.PromptTokens)
	}
	if usage.CompletionTokens != 5 {
		t.Errorf("Expected 5 output tokens, got %d", usage.CompletionTokens)
	}
}
