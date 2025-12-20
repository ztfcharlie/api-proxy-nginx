package main

import (
	"bufio"
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
			// fmt.Println("[HubLog]", line) 
			logChan <- line
		}
	}()

	// 2. 启动 Agent
	agentCmd := exec.Command(agentPath, "-id", "auth-agent-001")
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
	resp, err := http.Post("http://localhost:8080/v1/chat/completions", "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		log.Fatalf("Req failed: %v", err)
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	// 4. 检查日志
	log.Println("4. 等待计费日志...")
	
	timeout := time.After(5 * time.Second)
	found := false
	
	// 循环读取日志 channel
	for {
		select {
		case line := <-logChan:
			if strings.Contains(line, "💰 [Billing]") && strings.Contains(line, "Cost:") {
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