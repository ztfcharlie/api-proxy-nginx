package main

import (
	"edge-agent/internal/crypto"
	"edge-agent/internal/protocol"
	"edge-agent/internal/proxy"
	"encoding/hex"
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
	keyFile = flag.String("key", "agent.key", "Path to private key file")
	
	wsWriteMu sync.Mutex
)

func main() {
	flag.Parse()
	log.Printf("[Agent] Starting agent: %s", *agentID)

	// 加载密钥
	keys, err := crypto.LoadOrGenerateKeys(*keyFile)
	if err != nil {
		log.Fatalf("Failed to load keys: %v", err)
	}

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	for {
		err := connectAndServe(keys)
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

	// === 握手流程 ===
	
	// 1. 发送 Register (带公钥)
	regPayload := protocol.RegisterPayload{
		Version:   "v0.3",
		PublicKey: keys.GetPublicKeyHex(),
	}
	regData, _ := json.Marshal(regPayload)
	if err := safeWriteJSON(protocol.Packet{Type: protocol.TypeRegister, Payload: regData}); err != nil {
		return err
	}

	// 2. 等待 Challenge
	_, msg, err := conn.ReadMessage()
	if err != nil {
		return err
	}
	var challengePacket protocol.Packet
	if err := json.Unmarshal(msg, &challengePacket); err != nil {
		return err
	}
	if challengePacket.Type != protocol.TypeAuthChallenge {
		log.Printf("Expected challenge, got %s", challengePacket.Type)
		return err
	}
	
	var challenge protocol.AuthChallengePayload
	if err := json.Unmarshal(challengePacket.Payload, &challenge); err != nil {
		return err
	}

	// 3. 签名并发送
	signature := keys.Sign([]byte(challenge.Nonce))
	authPayload := protocol.AuthResponsePayload{
		Signature: hex.EncodeToString(signature),
	}
	authData, _ := json.Marshal(authPayload)
	if err := safeWriteJSON(protocol.Packet{Type: protocol.TypeAuthResponse, Payload: authData}); err != nil {
		return err
	}

	log.Println("[Agent] Handshake successful! Waiting for requests...")

	// === 正常消息循环 ===
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

		switch packet.Type {
		case protocol.TypeRequest:
			go func(pkt protocol.Packet) {
				proxy.HandleRequestWithSender(pkt, safeWriteJSON)
			}(packet)
		case protocol.TypePing:
			// 可以在这里回 Pong
		}
	}
}
