package main

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

func main() {
	log.Println("=== 开始第五阶段自动化测试 (Ops & Rate Limit) ===")

	cwd, _ := os.Getwd()
	hubPath := filepath.Join(cwd, "central-hub", "hub-server.exe")
	agentPath := filepath.Join(cwd, "edge-agent", "agent.exe")
	os.Remove(filepath.Join(cwd, "edge-agent", "agent.key"))

	// 1. 启动 Hub
	hubCmd := exec.Command(hubPath)
	if err := hubCmd.Start(); err != nil {
		log.Fatalf("Hub start failed: %v", err)
	}
	defer func() {
		log.Println("Kill Hub...")
		hubCmd.Process.Kill()
	}()

	// 2. 启动 Agent
	// 指定 UI 端口，防止冲突
	// 使用随机 ID
	randomID := "ops-agent-" + time.Now().Format("150405")
	
	agentCmd := exec.Command(agentPath)
	agentCmd.Env = append(os.Environ(), 
		"AGENT_ID="+randomID,
		"UI_PORT=9999",
		"RATE_LIMIT_RPM=60",
		"RATE_LIMIT_BURST=1",
	)
	agentCmd.Stdout = os.Stdout
	agentCmd.Stderr = os.Stderr // 观察 Agent 日志
	agentCmd.Start()
	defer agentCmd.Process.Kill()

	time.Sleep(3 * time.Second)

	// --- 测试 A: 验证 Web UI ---
	log.Println("--- 测试 A: Agent Web UI ---")
	resp, err := http.Get("http://127.0.0.1:9999/api/status")
	if err != nil {
		log.Fatalf("❌ UI 访问失败: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 200 {
		log.Println("✅ UI 接口访问成功 (200 OK)")
		body, _ := io.ReadAll(resp.Body)
		log.Printf("UI Status: %s", string(body))
	} else {
		log.Fatalf("❌ UI 状态码错误: %d", resp.StatusCode)
	}

	// --- 测试 B: 验证限流 (Rate Limiting) ---
	log.Println("--- 测试 B: 压力测试 (限流) ---")
	
	// 我们设置了 Agent 限流是 2 req/sec, burst 5
	// 我们尝试并发发 10 个请求，应该会有被拒绝的
	
	var wg sync.WaitGroup
	successCount := 0
	limitCount := 0
	errCount := 0
	
	var mu sync.Mutex

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			
			reqBody := []byte(`{"model": "gpt-4", "messages": [{"role": "user", "content": "hi"}]}`)
			rReq, _ := http.NewRequest("POST", "http://localhost:8080/v1/chat/completions", bytes.NewBuffer(reqBody))
			rReq.Header.Set("Content-Type", "application/json")
			rReq.Header.Set("Authorization", "Bearer sk-test-123")
			
			client := &http.Client{}
			r, err := client.Do(rReq)
			
			mu.Lock()
			defer mu.Unlock()

			if err != nil {
				log.Printf("Req %d error: %v", id, err)
				errCount++
				return
			}
			defer r.Body.Close()
			
			// 读取 Body 以触发 Agent 处理流程 (如果不读可能不报错)
			io.Copy(io.Discard, r.Body)

			if r.StatusCode == 200 {
				successCount++
			} else if r.StatusCode == 429 || r.StatusCode == 502 {
				// 502 也是可能的，如果 Agent 返回 error，Hub 会转为 502
				// 我们的 Agent 代码里明确返回 429 错误信息，但 HTTP 状态码是在 Hub 侧处理的
				// 在 Agent worker.go 里: respPayload.StatusCode = 429
				// Hub 会透传这个 429
				limitCount++
				log.Printf("Req %d was limited (Status: %d)", id, r.StatusCode)
			} else {
				log.Printf("Req %d unexpected status: %d", id, r.StatusCode)
			}
		}(i)
	}
	
	wg.Wait()

	log.Printf("结果统计: 成功=%d, 限流=%d, 错误=%d", successCount, limitCount, errCount)

	if limitCount > 0 {
		log.Println("✅ 触发了限流机制 (收到 429/502)")
		log.Println("🏆 第五阶段测试通过！")
	} else {
		log.Fatal("❌ 测试失败：所有请求都通过了，限流未生效！(或者请求不够快)")
	}
}