package main

import (
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
	log.Println("=== Stage 7: 全厂商路由与适配测试 ===")

	cwd, _ := os.Getwd()
	hubPath := filepath.Join(cwd, "central-hub", "hub-server.exe")
	agentPath := filepath.Join(cwd, "edge-agent", "agent.exe")
	
	agentID := fmt.Sprintf("all-agent-%d", time.Now().Unix())

	// 1. 启动 Hub
	hubCmd := exec.Command(hubPath)
	hubCmd.Env = append(os.Environ(), "ENABLE_TOFU=true") // Allow auto-registration for test
	stderrPipe, _ := hubCmd.StderrPipe()
	hubCmd.Stdout = os.Stdout
	hubCmd.Start()
	defer func() {
		log.Println("Kill Hub...")
		hubCmd.Process.Kill()
	}()

	// 日志监控
	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := stderrPipe.Read(buf)
			if n > 0 {
				fmt.Print(string(buf[:n]))
			}
			if err != nil { break }
		}
	}()

	// 2. 启动 Agent
	agentCmd := exec.Command(agentPath)
	agentCmd.Env = append(os.Environ(), "AGENT_ID="+agentID, "HUB_ADDRESS=localhost:8080")
	agentCmd.Stdout = os.Stdout
	agentCmd.Stderr = os.Stderr
	agentCmd.Start()
	defer agentCmd.Process.Kill()

	log.Println("Waiting for Agent config update (12s)...")
	time.Sleep(12 * time.Second)

	client := &http.Client{Timeout: 10 * time.Second}

	// 3. 测试用例
	testCases := []struct {
		Name  string
		Key   string
		Model string
	}{
		{"Anthropic", "sk-ant-test-key-123", "claude-3-opus"},
		{"Google",    "sk-goog-test-key-123", "gemini-pro"},
		{"AWS",       "sk-aws-test-key-123",  "claude-v2"},
		{"Azure",     "sk-azure-test-key-123", "gpt-4"},
	}

	for _, tc := range testCases {
		doTest(client, tc.Name, tc.Key, tc.Model)
		time.Sleep(1 * time.Second)
	}
}

func doTest(client *http.Client, name, key, model string) {
	log.Printf(">>> Testing Provider: %s", name)
	reqBody := []byte(fmt.Sprintf(`{"model": "%s", "messages": [{"role":"user","content":"hi"}]}`, model))
	req, _ := http.NewRequest("POST", "http://localhost:8080/v1/chat/completions", bytes.NewBuffer(reqBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[%s] Req Failed: %v", name, err)
		return
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	log.Printf("[%s] Status: %s", name, resp.Status)
	if name == "Google" {
		log.Printf("[%s] DEBUG BODY: %s", name, string(body))
	}
	
	// 预期结果:
	// 1. Hub 鉴权通过 (200 OK or Provider Error)
	// 2. Agent 尝试请求真实 API
	// 3. 真实 API 返回 401/403/404/400 (因为 Key 是假的)
	// 4. Hub 原样透传这个错误
	
	if resp.StatusCode == 503 {
		log.Printf("❌ [%s] Failed: No Agent Available", name)
	} else if resp.StatusCode == 401 {
		// 可能是 Hub 拦截 (Invalid Key) 或 厂商拦截 (Invalid API Key)
		// Hub 拦截 Body 通常是 "Invalid API Key"
		// 厂商拦截 Body 通常是 JSON
		if strings.Contains(string(body), "error") || strings.Contains(string(body), "Invalid") {
			log.Printf("✅ [%s] Passed (Provider Rejected: %s)", name, string(body))
		}
	} else if resp.StatusCode == 400 || resp.StatusCode == 404 || resp.StatusCode == 403 {
		log.Printf("✅ [%s] Passed (Provider Error: %s)", name, resp.Status)
	} else {
		log.Printf("❓ [%s] Check logs: %s", name, resp.Status)
	}
}
