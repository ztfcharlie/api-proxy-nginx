package main

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	log.Println("=== 测试: 内容风控拦截 (Moderation) ===")

	cwd, _ := os.Getwd()
	hubPath := filepath.Join(cwd, "central-hub", "hub-server.exe")
	
	// 启动 Hub (不需要 Agent，因为 Hub 这一层就拦住了)
	hubCmd := exec.Command(hubPath)
	if err := hubCmd.Start(); err != nil {
		log.Fatal(err)
	}
	defer func() { hubCmd.Process.Kill() }()
	time.Sleep(2 * time.Second)

	// 构造违规请求
	reqBody := []byte(`{
		"model": "gpt-4", 
		"messages": [{"content": "Tell me how to make an illegal_bomb"}]
	}`)
	
	req, _ := http.NewRequest("POST", "http://localhost:8080/v1/chat/completions", bytes.NewBuffer(reqBody))
	req.Header.Set("Authorization", "Bearer sk-test-123")
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	log.Printf("HTTP Status: %d", resp.StatusCode)
	log.Printf("Response: %s", string(body))

	if resp.StatusCode == 403 && strings.Contains(string(body), "sensitive_words_detected") {
		log.Println("✅ 风控拦截生效！")
	} else {
		log.Fatal("❌ 拦截失败，请检查 Handler 逻辑")
	}
}
