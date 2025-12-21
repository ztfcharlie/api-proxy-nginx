package main

import (
	"bufio"
	"bytes"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	log.Println("=== 开始 Level 2 测试 (Database & Auth) ===")

	cwd, _ := os.Getwd()
	hubPath := filepath.Join(cwd, "central-hub", "hub-server.exe")
	agentPath := filepath.Join(cwd, "edge-agent", "agent.exe")

	// 1. 启动 Hub
	hubCmd := exec.Command(hubPath)
	// 继承环境变量 (DB_DSN)
	hubCmd.Env = os.Environ() 
	hubCmd.Stdout = os.Stdout
	hubCmd.Stderr = os.Stderr
	hubCmd.Start()
	defer func() {
		log.Println("Kill Hub...")
		hubCmd.Process.Kill()
	}()
	time.Sleep(3 * time.Second) // 等待 DB 连接

	// 2. 启动 Agent
	agentCmd := exec.Command(agentPath, "-id", "agent-default")
	agentCmd.Env = append(os.Environ(), "AGENT_ID=auth-agent-001")
	agentCmd.Stdout = os.Stdout
	agentCmd.Stderr = os.Stderr
	agentCmd.Start()
	defer func() {
		log.Println("Kill Agent...")
		agentCmd.Process.Kill()
	}()
	time.Sleep(3 * time.Second)

	// 3. 发送请求 (带 Auth)
	log.Println("3. 发送 HTTP 请求到 Hub (带 API Key)...")
	reqBody := []byte(`{
		"model": "gpt-4",
		"messages": [{"role": "user", "content": "hi"}],
		"stream": true
	}`)
	
	req, _ := http.NewRequest("POST", "http://localhost:8080/v1/chat/completions", bytes.NewBuffer(reqBody))
	req.Header.Set("Content-Type", "application/json")
	// 使用 init.sql 里预设的 Key
	req.Header.Set("Authorization", "Bearer sk-test-123")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("❌ 请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Fatalf("❌ 状态码错误: %d (请检查数据库连接或 Key 是否正确)", resp.StatusCode)
	}

	// 4. 读取流式响应
	scanner := bufio.NewScanner(resp.Body)
	fullContent := ""
	
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, `"content":"`) {
			parts := strings.Split(line, `"content":"`)
			if len(parts) > 1 {
				contentPart := strings.Split(parts[1], `"`)[0]
				fullContent += contentPart
			}
		}
	}

	log.Printf("✅ 完整接收内容: [%s]", fullContent)

	expected := "Hello! MOCK Usage Test."
	if fullContent == expected {
		log.Println("🏆 Level 2 测试通过！数据库鉴权与结算正常。")
	} else {
		log.Fatalf("❌ 内容不匹配")
	}
}