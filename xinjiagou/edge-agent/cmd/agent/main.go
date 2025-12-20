package main

import (
	"edge-agent/internal/protocol"
	"edge-agent/internal/proxy"
	"encoding/json"
	"flag"
	"log"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var (
	hubAddr = flag.String("hub", "localhost:8080", "Hub server address")
	agentID = flag.String("id", "agent-001", "Unique Agent ID")
	
	// WebSocket 写锁，防止并发写入崩溃
	wsWriteMu sync.Mutex
)

func main() {
	flag.Parse()
	log.Printf("[Agent] Starting agent: %s", *agentID)

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	for {
		err := connectAndServe()
		if err != nil {
			log.Printf("[Agent] Connection error: %v", err)
		}
		
		log.Println("[Agent] Reconnecting in 3 seconds...")
		select {
		case <-interrupt:
			return
		case <-time.After(3 * time.Second):
		}
	}
}

func connectAndServe() error {
	u := url.URL{Scheme: "ws", Host: *hubAddr, Path: "/tunnel/connect", RawQuery: "agent_id=" + *agentID}
	log.Printf("[Agent] Connecting to %s", u.String())

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	log.Println("[Agent] Connected successfully!")

	// 封装一个线程安全的 WriteJSON 函数
	safeWriteJSON := func(v interface{}) error {
		wsWriteMu.Lock()
		defer wsWriteMu.Unlock()
		return conn.WriteJSON(v)
	}

	// 注册
	regMsg := protocol.Packet{
		Type:    protocol.TypeRegister,
		Payload: json.RawMessage(`{"version":"v0.2"}`),
	}
	if err := safeWriteJSON(regMsg); err != nil {
		return err
	}

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			return err
		}

		var packet protocol.Packet
		if err := json.Unmarshal(message, &packet); err != nil {
			log.Printf("[Agent] Invalid packet: %v", err)
			continue
		}

		// 处理不同类型的消息
		switch packet.Type {
		case protocol.TypeRequest:
			// 启动一个 Goroutine 处理请求，防止阻塞读取循环
			go func(pkt protocol.Packet) {
				// 这里我们需要修改 proxy.HandleRequest 让它接受 safeWriteJSON
				// 为了代码简洁，我们直接在这里简单改写一下调用方式
				// 注意：实际项目中应该重构 proxy 包的接口
				proxy.HandleRequestWithSender(pkt, safeWriteJSON)
			}(packet)
		default:
			log.Printf("[Agent] Received unknown type: %s", packet.Type)
		}
	}
}