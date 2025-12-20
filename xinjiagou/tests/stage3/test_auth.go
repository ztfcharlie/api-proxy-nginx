package main

import (
	"log"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

func main() {
	log.Println("=== 开始第三阶段自动化测试 (Security Auth Test) ===")

	cwd, _ := os.Getwd()
	hubPath := filepath.Join(cwd, "central-hub", "hub-server.exe")
	agentPath := filepath.Join(cwd, "edge-agent", "agent.exe")

	// 1. 启动 Hub
	hubCmd := exec.Command(hubPath)
	hubCmd.Stdout = os.Stdout
	hubCmd.Stderr = os.Stderr
	if err := hubCmd.Start(); err != nil {
		log.Fatalf("Hub start failed: %v", err)
	}
	defer func() {
		log.Println("Kill Hub...")
		hubCmd.Process.Kill()
	}()
	time.Sleep(2 * time.Second)

	// 2. 正常 Agent 测试
	log.Println("---" + "测试 A: 合法 Agent 握手" + "---")
	// 删除旧的 key 文件以确保重新生成
	os.Remove(filepath.Join(cwd, "edge-agent", "agent.key"))

	agentCmd := exec.Command(agentPath, "-id", "auth-agent-001")
	// 捕获输出用于分析
	var agentOut strings.Builder
	agentCmd.Stdout = &agentOut
	agentCmd.Stderr = &agentOut
	
	agentCmd.Start()
	defer agentCmd.Process.Kill()

	time.Sleep(3 * time.Second)
	logs := agentOut.String()
	if strings.Contains(logs, "Handshake successful") {
		log.Println("✅ 合法 Agent 握手成功")
	} else {
		log.Printf("❌ 合法 Agent 握手失败，日志:\n%s", logs)
		os.Exit(1)
	}

	// 3. 黑客 Agent 测试
	log.Println("---" + "测试 B: 非法 Agent (无签名)" + "---")
	if err := runHackerAttack(); err != nil {
		log.Printf("✅ 黑客攻击被拦截: %v", err)
	} else {
		log.Fatalf("❌ 黑客攻击竟然成功了！Hub 没有断开连接！")
	}

	log.Println("🏆 第三阶段测试通过！安全系统正常工作。")
}

// runHackerAttack 模拟一个不守规矩的客户端
func runHackerAttack() error {
	u := url.URL{Scheme: "ws", Host: "localhost:8080", Path: "/tunnel/connect", RawQuery: "agent_id=hacker-001"}
	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	// 黑客不发送 Register，直接发个 Ping 或者发个垃圾包
	// Hub 应该在等待 Register 超时或者收到错误包后断开连接
	badPacket := `{"type": "ping"}`
	conn.WriteMessage(websocket.TextMessage, []byte(badPacket))

	// 读取 Hub 的反应
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, _, err = conn.ReadMessage()
	
	// 如果 err 不为空 (EOF 或 Reset)，说明连接被 Hub 关了 -> 预期行为
	// 如果 err 为空，说明 Hub 居然理我们了 -> 安全漏洞
	if err != nil {
		return err // 这是一个"好"的错误
	}
	return nil // 连接依然存活
}