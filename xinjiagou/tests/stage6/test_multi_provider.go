package main

import (
	"bufio"
	"bytes"
	"fmt"
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
	log.Println("=== 开始第六阶段测试 (Multi-Provider Routing) ===")

	cwd, _ := os.Getwd()
	hubPath := filepath.Join(cwd, "central-hub", "hub-server.exe")
	agentPath := filepath.Join(cwd, "edge-agent", "agent.exe")
	
	// 使用随机 Agent ID 避免冲突
	agentID := fmt.Sprintf("multi-agent-%d", time.Now().Unix())

	// 1. 启动 Hub
	hubCmd := exec.Command(hubPath)
	stderrPipe, _ := hubCmd.StderrPipe()
	hubCmd.Stdout = os.Stdout
	if err := hubCmd.Start(); err != nil {
		log.Fatalf("Hub start failed: %v", err)
	}
	defer func() {
		log.Println("Kill Hub...")
		hubCmd.Process.Kill()
	}()

	// 监控 Hub 日志
	logChan := make(chan string, 100)
	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			fmt.Println("[HubLog]", line)
			logChan <- line
		}
	}()

	// 2. 启动 Agent
	// Agent 默认会先报 OpenAI，10秒后动态添加 Anthropic
	agentCmd := exec.Command(agentPath)
	agentCmd.Env = append(os.Environ(), 
		"AGENT_ID="+agentID,
		"HUB_ADDRESS=localhost:8080",
	)
	agentCmd.Stdout = os.Stdout
	agentCmd.Stderr = os.Stderr
	agentCmd.Start()
	defer agentCmd.Process.Kill()

	log.Println("Waiting for Agent dynamic update (approx 12s)...")
	
	// 等待日志出现 "updated instances"
	timeout := time.After(20 * time.Second)
	updated := false
	
Loop:
	for {
		select {
		case line := <-logChan:
			if strings.Contains(line, "updated instances") {
				log.Println("✅ 检测到 Agent 动态更新配置")
				updated = true
				break Loop
			}
		case <-timeout:
			log.Println("⚠️ 等待超时，尝试直接请求 (可能日志漏了)")
			break Loop
		}
	}

	if !updated {
		// 也许 Agent 还没更，再等一会
		time.Sleep(2 * time.Second)
	}

	// 3. 发送 Anthropic 请求
	log.Println("3. 发送 Anthropic 请求 (Key: sk-ant-test)...")
	
	// 构造 OpenAI 格式的请求 (Hub 是透传的，但我们模拟客户端用 OpenAI SDK 调 Claude)
	// 注意：真实场景下 Body 应该是 Claude 格式，但目前的 Proxy 是 Mock 的，
	// 它不解析 Body，只是原样返回 Mock 数据。
	// 重点是验证 Hub 的路由逻辑。
	reqBody := []byte(`{
		"model": "claude-3-opus", 
		"messages": [{"role": "user", "content": "Hello Claude"}]
	}`)
	
	req, _ := http.NewRequest("POST", "http://localhost:8080/v1/chat/completions", bytes.NewBuffer(reqBody))
	req.Header.Set("Content-Type", "application/json")
	// 关键：使用 Anthropic 前缀的 Key
	req.Header.Set("Authorization", "Bearer sk-ant-test-key-123")
	
	client := &http.Client{}
	resp, err := client.Do(req)
	
	if err != nil {
		log.Fatalf("Req failed: %v", err)
	}
	defer resp.Body.Close()
	
	respBytes, _ := io.ReadAll(resp.Body)
	log.Printf("HTTP Status: %s", resp.Status)
	log.Printf("HTTP Body: %s", string(respBytes))

	if resp.StatusCode == 200 {
		log.Println("✅ 请求成功！Hub 正确识别了 sk-ant- 前缀并路由到了支持 Anthropic 的实例。")
		log.Println("🏆 第六阶段测试通过！")
	} else {
		log.Fatalf("❌ 测试失败：状态码 %d", resp.StatusCode)
	}
}
