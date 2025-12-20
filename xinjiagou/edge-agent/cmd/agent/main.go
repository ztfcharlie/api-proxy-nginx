package main

import (
	"edge-agent/internal/crypto"
	"edge-agent/internal/protocol"
	"edge-agent/internal/proxy"
	"edge-agent/internal/ui"
	"encoding/hex"
	"encoding/json"
	"flag"
	"log"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/time/rate"
)

var (
	hubAddr = flag.String("hub", "localhost:8080", "Hub server address")
	agentID = flag.String("id", "agent-001", "Unique Agent ID")
	keyFile = flag.String("key", "agent.key", "Path to private key file")
	uiAddr  = flag.String("ui", "127.0.0.1:9999", "Local UI address")
	
	wsWriteMu sync.Mutex
	// 默认限流: 每秒 2 个请求 (RPM=120)，桶大小 5
	limiter = rate.NewLimiter(2, 5)
)

func main() {
	flag.Parse()
	log.Printf("[Agent] Starting agent: %s", *agentID)

	ui.GlobalState.AgentID = *agentID
	ui.GlobalState.HubAddr = *hubAddr
	ui.StartServer(*uiAddr)

	keys, err := crypto.LoadOrGenerateKeys(*keyFile)
	if err != nil {
		log.Fatalf("Failed to load keys: %v", err)
	}

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	for {
		ui.GlobalState.Connected = false
		err := connectAndServe(keys)
		if err != nil {
			log.Printf("[Agent] Connection error: %v", err)
		}
		
		ui.GlobalState.Connected = false
		log.Println("[Agent] Reconnecting in 3 seconds...")
		select {
		case <-interrupt:
			return
		case <-time.After(3 * time.Second):
		}
	}
}

func connectAndServe(keys *crypto.KeyPair) error {
	u := url.URL{Scheme: "ws", Host: *hubAddr, Path: "/tunnel/connect", RawQuery: "agent_id=" + *agentID}
	log.Printf("[Agent] Connecting to %s", u.String())

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	safeWriteJSON := func(v interface{}) error {
		wsWriteMu.Lock()
		defer wsWriteMu.Unlock()
		return conn.WriteJSON(v)
	}

	regPayload := protocol.RegisterPayload{Version: "v0.3", PublicKey: keys.GetPublicKeyHex()}
	regData, _ := json.Marshal(regPayload)
	if err := safeWriteJSON(protocol.Packet{Type: protocol.TypeRegister, Payload: regData}); err != nil {
		return err
	}

	_, msg, err := conn.ReadMessage()
	if err != nil { return err }
	var challengePacket protocol.Packet
	json.Unmarshal(msg, &challengePacket)
	
	var challenge protocol.AuthChallengePayload
	json.Unmarshal(challengePacket.Payload, &challenge)

	signature := keys.Sign([]byte(challenge.Nonce))
	authPayload := protocol.AuthResponsePayload{Signature: hex.EncodeToString(signature)}
	authData, _ := json.Marshal(authPayload)
	if err := safeWriteJSON(protocol.Packet{Type: protocol.TypeAuthResponse, Payload: authData}); err != nil {
		return err
	}

	log.Println("[Agent] Handshake successful!")
	ui.GlobalState.Connected = true

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			return err
		}

		var packet protocol.Packet
		if err := json.Unmarshal(message, &packet); err != nil {
			continue
		}

		switch packet.Type {
		case protocol.TypeRequest:
			// === 核心修改: 限流检查 ===
			if !limiter.Allow() {
				log.Printf("[Agent] Rate limit exceeded! Rejecting request %s", packet.RequestID)
				
				// 构造错误响应
				respPayload := protocol.HttpResponsePayload{
					StatusCode: 429,
					Error:      "Agent Rate Limit Exceeded",
					IsFinal:    true,
				}
				data, _ := json.Marshal(respPayload)
				safeWriteJSON(protocol.Packet{
					Type:      protocol.TypeResponse,
					RequestID: packet.RequestID,
					Payload:   data,
				})
				continue
			}
			
			atomic.AddInt64(&ui.GlobalState.TotalRequests, 1)
			go func(pkt protocol.Packet) {
				proxy.HandleRequestWithSender(pkt, safeWriteJSON)
			}(packet)
		}
	}
}
