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
	log.Println("=== 开始第四阶段自动化测试 (Billing Test) ===")

	cwd, _ := os.Getwd()
	hubPath := filepath.Join(cwd, "central-hub", "hub-server.exe")
	agentPath := filepath.Join(cwd, "edge-agent", "agent.exe")
	
	os.Remove(filepath.Join(cwd, "edge-agent", "agent.key"))

	// 1. 启动 Hub
	hubCmd := exec.Command(hubPath)
	
	// 关键修改：同时捕获 Stdout 和 Stderr
	// 因为 log.Printf 默认输出到 Stderr
	stderrPipe, _ := hubCmd.StderrPipe()
	hubCmd.Stdout = os.Stdout // Stdout 直接打印出来
	
	if err := hubCmd.Start(); err != nil {
		log.Fatalf("Hub start failed: %v", err)
	}
	defer func() {
		log.Println("Kill Hub...")
		hubCmd.Process.Kill()
	}()

	// 启动一个 Goroutine 实时监控 Hub 的 Stderr 日志
	// 这样就不会错过任何一行
	logChan := make(chan string)
	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			// 打印出来方便看
			fmt.Println("[HubLog]", line) 
			logChan <- line
		}
	}()

	// 2. 启动 Agent
	// 使用随机 ID 避免 Key 冲突
	randomID := fmt.Sprintf("bill-agent-%d", time.Now().Unix())
	// loader.go 只读环境变量，不读 flag，所以 flag -id 无效
	agentCmd := exec.Command(agentPath) 
	agentCmd.Env = append(os.Environ(), 
		"AGENT_ID="+randomID,
		"HUB_ADDRESS=localhost:8080",
	)
	agentCmd.Stdout = os.Stdout
	agentCmd.Stderr = os.Stderr
	agentCmd.Start()
	defer agentCmd.Process.Kill()

	time.Sleep(3 * time.Second)

	// 3. 发送请求
	log.Println("3. 发送请求 (Mock GPT-4)...")
	reqBody := []byte(`{
		"model": "gpt-4", 
		"messages": [{"role": "user", "content": "hi"}],
		"stream": true
	}`)
	
	req, _ := http.NewRequest("POST", "http://localhost:8080/v1/chat/completions", bytes.NewBuffer(reqBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer sk-test-123") // From init.sql
	
	client := &http.Client{}
	resp, err := client.Do(req)
	
	if err != nil {
		log.Fatalf("Req failed: %v", err)
	}
	
	respBytes, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	log.Printf("HTTP Status: %s", resp.Status)
	log.Printf("HTTP Body: %s", string(respBytes))

	// 4. 检查日志
	log.Println("4. 等待计费日志...")
	
	timeout := time.After(5 * time.Second)
	found := false
	
	// 循环读取日志 channel
	for {
		select {
		case line := <-logChan:
			if strings.Contains(line, "💰 [Settlement]") && strings.Contains(line, "Cost:") {
				log.Println("✅ 找到计费日志: " + line)
				found = true
				goto END
			}
		case <-timeout:
			goto END
		}
	}

END:
	if found {
		log.Println("🏆 第四阶段测试通过！计费逻辑已触发。")
	} else {
		log.Fatal("❌ 测试失败：未检测到扣费动作 (请检查 stderr 日志)。")
	}
}