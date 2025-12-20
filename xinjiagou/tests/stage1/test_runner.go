package main

import (
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

func main() {
	log.Println("=== 开始第一阶段自动化测试 (Stage 1 Integration Test) ===")

	// 1. 确定 exe 路径
	cwd, _ := os.Getwd()
	hubPath := filepath.Join(cwd, "central-hub", "hub-server.exe")
	agentPath := filepath.Join(cwd, "edge-agent", "agent.exe")

	// 2. 启动 Hub Server
	log.Printf("1. 正在启动 Hub Server [%s]...", hubPath)
	hubCmd := exec.Command(hubPath)
	// 将 Hub 的输出重定向到控制台，方便观察
	hubCmd.Stdout = os.Stdout
	hubCmd.Stderr = os.Stderr
	
	if err := hubCmd.Start(); err != nil {
		log.Fatalf("❌ Hub 启动失败: %v", err)
	}
	defer func() {
		log.Println("正在关闭 Hub...")
		hubCmd.Process.Kill()
	}()

	// 等待 Hub 启动
	time.Sleep(2 * time.Second)
	if !checkPort("localhost:8080") {
		log.Fatal("❌ Hub 端口 8080 未开启，测试失败。")
	}
	log.Println("✅ Hub 端口检测通过 (TCP :8080 open)")

	// 3. 启动 Agent Client
	log.Printf("2. 正在启动 Agent Client [%s]...", agentPath)
	agentCmd := exec.Command(agentPath, "-id", "test-agent-999")
	agentCmd.Stdout = os.Stdout
	agentCmd.Stderr = os.Stderr

	if err := agentCmd.Start(); err != nil {
		log.Fatalf("❌ Agent 启动失败: %v", err)
	}
	defer func() {
		log.Println("正在关闭 Agent...")
		agentCmd.Process.Kill()
	}()

	// 4. 观察连接状态 (通过 sleep 模拟人工观察日志)
	log.Println("3. 等待 Agent 连接 (请观察上方是否有 Connected 日志)...")
	time.Sleep(3 * time.Second)

	log.Println("=== 测试结束，请检查上方日志中是否包含 'Connected successfully' ===")
}

// checkPort 检查端口是否占用
func checkPort(addr string) bool {
	timeout := time.Second
	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return false
	}
	if conn != nil {
		conn.Close()
		return true
	}
	return false
}
