package main

import (
	"context"
	"edge-agent/internal/config"
	"edge-agent/internal/crypto"
	"edge-agent/internal/ledger"
	"edge-agent/internal/protocol"
	"edge-agent/internal/proxy"
	"edge-agent/internal/ui"
	"encoding/hex"
	"encoding/json"
	"log"
	"math/rand"
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
	cfg *config.Config
	wsWriteMu sync.Mutex
	limiter   *rate.Limiter
	activeStreams sync.Map
	store     *ledger.Store
)

func main() {
	rand.Seed(time.Now().UnixNano())
	cfg = config.Load()
	log.Printf("[Agent] Starting agent: %s (Hub: %s)", cfg.AgentID, cfg.HubAddr)

	rps := rate.Limit(float64(cfg.RateLimitRPM) / 60.0)
	limiter = rate.NewLimiter(rps, cfg.RateLimitBurst)

	var err error
	store, err = ledger.NewStore("ledger.db")
	if err != nil {
		log.Fatalf("Failed to init ledger: %v", err)
	}

	ui.GlobalState.AgentID = cfg.AgentID
	ui.GlobalState.HubAddr = cfg.HubAddr
	ui.StartServer("127.0.0.1:" + cfg.UIPort)

	keys, err := crypto.LoadOrGenerateKeys(cfg.KeyFile)
	if err != nil {
		log.Fatalf("Failed to load keys: %v", err)
	}

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	retryCount := 0

	for {
		ui.GlobalState.Connected = false
		startTime := time.Now()
		
		err := connectAndServe(keys)
		
		ui.GlobalState.Connected = false
		if err != nil {
			log.Printf("[Agent] Connection lost: %v", err)
		}

		if time.Since(startTime) > 60*time.Second {
			retryCount = 0
		} else {
			retryCount++
		}

		backoff := time.Second * (1 << retryCount)
		if backoff > 30*time.Second { backoff = 30 * time.Second }
		jitter := time.Duration(rand.Intn(1000)) * time.Millisecond
		time.Sleep(backoff + jitter)
	}
}

func connectAndServe(keys *crypto.KeyPair) error {
	u := url.URL{Scheme: "ws", Host: cfg.HubAddr, Path: "/tunnel/connect", RawQuery: "agent_id=" + cfg.AgentID}
	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil { return err }
	defer conn.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	safeWriteJSON := func(v interface{}) error {
		wsWriteMu.Lock()
		defer wsWriteMu.Unlock()
		conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
		return conn.WriteJSON(v)
	}

	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	regPayload := protocol.RegisterPayload{Version: "v0.3", PublicKey: keys.GetPublicKeyHex()}
	regData, _ := json.Marshal(regPayload)
	if err := safeWriteJSON(protocol.Packet{Type: protocol.TypeRegister, Payload: regData}); err != nil { return err }

	_, msg, err := conn.ReadMessage()
	if err != nil { return err }
	var packet protocol.Packet
	json.Unmarshal(msg, &packet)
	var challenge protocol.AuthChallengePayload
	json.Unmarshal(packet.Payload, &challenge)
	signature := keys.Sign([]byte(challenge.Nonce))
	authPayload := protocol.AuthResponsePayload{Signature: hex.EncodeToString(signature)}
	authData, _ := json.Marshal(authPayload)
	if err := safeWriteJSON(protocol.Packet{Type: protocol.TypeAuthResponse, Payload: authData}); err != nil { return err }

	log.Println("[Agent] Handshake successful!")
	ui.GlobalState.Connected = true

	done := make(chan struct{})
	defer close(done)
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done: return
			case <-ticker.C:
				if err := safeWriteJSON(protocol.Packet{Type: protocol.TypePing}); err != nil {
					conn.Close(); return
				}
			}
		}
	}()

	pongWait := 60 * time.Second
	conn.SetReadDeadline(time.Now().Add(pongWait))

	for {
		_, message, err := conn.ReadMessage()
		if err != nil { return err }
		conn.SetReadDeadline(time.Now().Add(pongWait))

		var pkt protocol.Packet
		if err := json.Unmarshal(message, &pkt); err != nil { continue }

		switch pkt.Type {
		case protocol.TypeRequest:
			var payload protocol.HttpRequestPayload
			if err := json.Unmarshal(pkt.Payload, &payload); err != nil { continue }

			val, loaded := activeStreams.Load(pkt.RequestID)
			
			if !loaded {
				if !limiter.Allow() {
					log.Printf("[Agent] Rate limit exceeded!")
					respPayload := protocol.HttpResponsePayload{StatusCode: 429, Error: "Rate Limit", IsFinal: true}
					data, _ := json.Marshal(respPayload)
					safeWriteJSON(protocol.Packet{Type: protocol.TypeResponse, RequestID: pkt.RequestID, Payload: data})
					continue
				}
				atomic.AddInt64(&ui.GlobalState.TotalRequests, 1)

				streamer := proxy.NewRequestStreamer(pkt.RequestID)
				activeStreams.Store(pkt.RequestID, streamer)
				val = streamer

				go func(id string) {
					defer activeStreams.Delete(id)
					
					// 修正: 回调函数现在必须返回 string (Hash)
					onComplete := func(rid string, usage *protocol.Usage) string {
						hash, err := store.RecordTransaction(rid, usage.PromptTokens, usage.CompletionTokens)
						if err != nil {
							log.Printf("❌ [Ledger] Failed to record: %v", err)
							return ""
						}
						log.Printf("✅ [Ledger] Recorded tx %s, hash: %s...", rid, hash[:8])
						return hash
					}
					
					proxy.DoRequest(ctx, streamer, safeWriteJSON, onComplete)
				}(pkt.RequestID)
			}

			streamer := val.(*proxy.RequestStreamer)
			if err := streamer.WriteChunk(payload); err != nil {
				log.Printf("[Agent] Stream stalled, dropping req %s: %v", pkt.RequestID, err)
				activeStreams.Delete(pkt.RequestID)
				respPayload := protocol.HttpResponsePayload{Error: "Agent Buffer Overflow", IsFinal: true}
				data, _ := json.Marshal(respPayload)
				safeWriteJSON(protocol.Packet{Type: protocol.TypeResponse, RequestID: pkt.RequestID, Payload: data})
			}

		case protocol.TypePong:
		}
	}
}