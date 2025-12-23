package main

import (
	"bytes"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

func main() {
	log.Println("=== Stage 8: DoS 防护测试 (Dynamic Limits) ===")

	cwd, _ := os.Getwd()
	hubPath := filepath.Join(cwd, "central-hub", "hub-server.exe")
	
	// 1. 启动 Hub (无需 Agent，因为我们在 Gateway 层就被拦截了)
	hubCmd := exec.Command(hubPath)
	hubCmd.Stdout = os.Stdout
	if err := hubCmd.Start(); err != nil {
		log.Fatal(err)
	}
	defer func() { hubCmd.Process.Kill() }()
	time.Sleep(2 * time.Second)

	// 2. 测试正常请求
	log.Println("--- Test A: Normal Request (1KB) ---")
	sendRequest("gpt-4", 1024, 200) // Expect 200 (or 503 if no agent, but passed limit check)

	// 3. 测试超大请求 (GPT-4 Limit = 2MB)
	log.Println("--- Test B: Oversized Request (3MB) ---")
	sendRequest("gpt-4", 3*1024*1024, 413) // Expect 413 Payload Too Large
}

func sendRequest(model string, size int, expectedStatus int) {
	// Construct a large body with "model": "..." at the beginning
	// Padding with spaces
	padding := make([]byte, size)
	// Fill with spaces
	for i := range padding { padding[i] = ' ' }
	
	jsonStart := fmt.Sprintf(`{"model": "%s", "padding": "`, model)
	copy(padding, jsonStart)
	// Close JSON at the end
	padding[len(padding)-2] = '"'
	padding[len(padding)-1] = '}'
	
	req, _ := http.NewRequest("POST", "http://localhost:8080/v1/chat/completions", bytes.NewBuffer(padding))
	req.Header.Set("Authorization", "Bearer sk-test-123")
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("Req failed: %v", err)
		return
	}
	defer resp.Body.Close()
	
	if resp.StatusCode == expectedStatus {
		log.Printf("✅ Passed: Got %d", resp.StatusCode)
	} else if expectedStatus == 200 && resp.StatusCode == 503 {
		log.Printf("✅ Passed (Limit Check OK, but No Agent): %d", resp.StatusCode)
	} else {
		log.Printf("❌ Failed: Expected %d, Got %d", expectedStatus, resp.StatusCode)
		os.Exit(1)
	}
}
