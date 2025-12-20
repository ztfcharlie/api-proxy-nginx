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
	log.Println("=== 开始第二阶段自动化测试 (Proxy Mock Test) ===")

	cwd, _ := os.Getwd()
	hubPath := filepath.Join(cwd, "central-hub", "hub-server.exe")
	agentPath := filepath.Join(cwd, "edge-agent", "agent.exe")

	// 1. 启动 Hub
	hubCmd := exec.Command(hubPath)
	hubCmd.Stdout = os.Stdout
	hubCmd.Stderr = os.Stderr
	hubCmd.Start()
	defer func() {
		log.Println("Kill Hub...")
		hubCmd.Process.Kill()
	}()
	time.Sleep(2 * time.Second)

	// 2. 启动 Agent
	agentCmd := exec.Command(agentPath)
	// 修正: 通过环境变量注入正确的 ID，配合 Hub 的预期
	// 继承父进程的环境变量，并覆盖 AGENT_ID
	agentCmd.Env = append(os.Environ(), "AGENT_ID=auth-agent-001")
	
	agentCmd.Stdout = os.Stdout
	agentCmd.Stderr = os.Stderr
	agentCmd.Start()
	defer func() {
		log.Println("Kill Agent...")
		agentCmd.Process.Kill()
	}()
	time.Sleep(2 * time.Second)

	// 3. 发送请求
	log.Println("3. 发送 HTTP 请求到 Hub...")
	reqBody := []byte(`{
		"model": "gpt-mock",
		"messages": [{"role": "user", "content": "hi"}],
		"stream": true
	}`)
	
	resp, err := http.Post("http://localhost:8080/v1/chat/completions", "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		log.Fatalf("❌ 请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Fatalf("❌ 状态码错误: %d", resp.StatusCode)
	}

	// 4. 读取流式响应
	log.Println("4. 正在接收流式响应...")
	scanner := bufio.NewScanner(resp.Body)
	fullContent := ""
	
	for scanner.Scan() {
		line := scanner.Text()
		log.Printf("[Stream] %s", line)
		
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
		log.Println("🏆 测试通过！Mock 数据完整无误。")
	} else {
		log.Fatalf("❌ 内容不匹配! \n期望: %s \n实际: %s", expected, fullContent)
	}
}
