package main

import (
	"context"
	"edge-agent/internal/config"
	"edge-agent/internal/crypto"
	"edge-agent/internal/keystore"
	"edge-agent/internal/ledger"
	"edge-agent/internal/protocol"
	"edge-agent/internal/proxy"
	"edge-agent/internal/ui"
	"encoding/hex"
	"encoding/json"
	"log"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/time/rate"
	"gopkg.in/natefinch/lumberjack.v2"
)

var (
	cfg *config.Config
	wsWriteMu sync.Mutex
	limiter   *rate.Limiter
	activeStreams sync.Map
	reqCancels    sync.Map
	store     *ledger.Store
	modelMgr  *ModelManager
)

// ModelManager manages the supported instances
type ModelManager struct {
	mu        sync.Mutex
	instances []protocol.InstanceConfig
}

func (m *ModelManager) GetInstances() []protocol.InstanceConfig {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]protocol.InstanceConfig(nil), m.instances...)
}

func (m *ModelManager) UpdateInstances(newInstances []protocol.InstanceConfig) {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	// Duplicate ID Check
	seen := make(map[string]bool)
	var uniqueInstances []protocol.InstanceConfig
	
	for _, inst := range newInstances {
		if seen[inst.ID] {
			log.Printf("[Config] Warning: Duplicate Instance ID '%s' found. Skipping duplicate.", inst.ID)
			continue
		}
		seen[inst.ID] = true
		uniqueInstances = append(uniqueInstances, inst)
	}
	
	m.instances = uniqueInstances
}

func (m *ModelManager) GetInstance(id string) *protocol.InstanceConfig {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, inst := range m.instances {
		if inst.ID == id {
			// Return copy
			c := inst
			return &c
		}
	}
	return nil
}

func main() {
	rand.Seed(time.Now().UnixNano())
	cfg = config.Load()
	
	// Setup Logging
	log.SetOutput(&lumberjack.Logger{
		Filename:   "agent.log",
		MaxSize:    10, // megabytes
		MaxBackups: 3,
		MaxAge:     28, // days
	})
	
	// 1. Init KeyStore (Security Hardening)
	masterKey := os.Getenv("AGENT_MASTER_KEY")
	if masterKey == "" {
		masterKey = "admin" // Dev default
		log.Println("[Security] Warning: Using default master key 'admin'. Set AGENT_MASTER_KEY in prod.")
	}
	if err := keystore.GlobalStore.Load("credentials.enc", masterKey); err != nil {
		log.Fatalf("Failed to load keystore: %v", err)
	}
	
	// Mock: Inject secrets into KeyStore (In prod, this is done via CLI/UI, not hardcoded)
	keystore.GlobalStore.Set("acc-openai-1", "sk-openai-real-key")
	keystore.GlobalStore.Set("acc-ant-1", "sk-ant-real-key")
	keystore.GlobalStore.Set("acc-goog-1", "sk-goog-real-key") // or JSON content
	keystore.GlobalStore.Set("aws-cred-1", "AKID:SECRET:us-east-1") 
	keystore.GlobalStore.Set("acc-azure-1", "sk-azure-real-key")
	// Save back to verify encryption
	keystore.GlobalStore.Save("credentials.enc", masterKey)

	// Init Instances (Using References ID)
	modelMgr = &ModelManager{
		instances: []protocol.InstanceConfig{
			{ID: "acc-openai-1", Provider: "openai", Models: []string{"gpt-4"}, Tier: "T0", RPM: 5000},
		},
	}
	
	// Inject Config Lookup into Proxy
	proxy.GetInstanceConfig = modelMgr.GetInstance
	
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
	
	// Simulate Dynamic Update
	go func() {
		time.Sleep(5 * time.Second) // Faster update for test
		log.Println("[Agent] Dynamic Config Change: Loading ALL providers")
		newConfig := []protocol.InstanceConfig{
			{ID: "acc-openai-1", Provider: "openai", Models: []string{"gpt-4"}, Tier: "T1"},
			{ID: "acc-ant-1", Provider: "anthropic", Models: []string{"claude-3-opus"}, Tier: "T1"},
			{ID: "acc-goog-1", Provider: "google", Models: []string{"gemini-pro"}, Tier: "T1", Tags: []string{"aistudio"}},
			{ID: "aws-cred-1", Provider: "aws", Models: []string{"claude-v2"}, Tier: "T1"}, // AWS Mock ID
			{ID: "acc-azure-1", Provider: "azure", Models: []string{"gpt-4"}, Tier: "T1"},
		}
		modelMgr.UpdateInstances(newConfig)
	}()

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
	
	dialer := websocket.Dialer{
		NetDial: func(network, addr string) (net.Conn, error) {
			return net.DialTimeout(network, addr, 5*time.Second)
		},
		HandshakeTimeout: 45 * time.Second,
	}
	
	conn, _, err := dialer.Dial(u.String(), nil)
	if err != nil { return err }
	defer conn.Close()
	
	// Enable TCP KeepAlive on the raw connection
	if tcpConn, ok := conn.UnderlyingConn().(*net.TCPConn); ok {
		tcpConn.SetKeepAlive(true)
		tcpConn.SetKeepAlivePeriod(30 * time.Second)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	safeWriteJSON := func(v interface{}) error {
		wsWriteMu.Lock()
		defer wsWriteMu.Unlock()
		conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
		return conn.WriteJSON(v)
	}

	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	
	// Send Initial Instances
	currentInstances := modelMgr.GetInstances()
	regPayload := protocol.RegisterPayload{
		Version:   "v0.3", 
		PublicKey: keys.GetPublicKeyHex(),
		Instances: currentInstances,
	}
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

	log.Println("[Agent] Handshake successful! Instances reported:", len(currentInstances))
	ui.GlobalState.Connected = true

	done := make(chan struct{})
	defer close(done)
	
	// Heartbeat & Dynamic Update Loop
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		
		// Check for updates every 5 seconds
		modelTicker := time.NewTicker(5 * time.Second)
		defer modelTicker.Stop()
		
		lastInstancesJSON, _ := json.Marshal(currentInstances)

		for {
			select {
			case <-done: return
			case <-ticker.C:
				if err := safeWriteJSON(protocol.Packet{Type: protocol.TypePing}); err != nil {
					conn.Close(); return
				}
			case <-modelTicker.C:
				newInstances := modelMgr.GetInstances()
				newInstancesJSON, _ := json.Marshal(newInstances)
				if string(newInstancesJSON) != string(lastInstancesJSON) {
					// Detect change, send update
					log.Printf("[Agent] Config changed, sending update...")
					updatePayload := protocol.ModelUpdatePayload{Instances: newInstances}
					payloadData, _ := json.Marshal(updatePayload)
					if err := safeWriteJSON(protocol.Packet{Type: protocol.TypeModelUpdate, Payload: payloadData}); err != nil {
						log.Printf("[Agent] Failed to send update: %v", err)
						conn.Close(); return
					}
					lastInstancesJSON = newInstancesJSON
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
		case protocol.TypeProbe:
			var payload protocol.ProbePayload
			if err := json.Unmarshal(pkt.Payload, &payload); err != nil { continue }
			
			go func() {
				log.Printf("[Agent] Received IP Probe request to %s", payload.URL)
				// 发起请求
				resp, err := http.Get(payload.URL)
				if err != nil {
					log.Printf("[Agent] Probe failed: %v", err)
					return
				}
				defer resp.Body.Close()
			}()

		case protocol.TypeAbort:
			if cancelVal, ok := reqCancels.Load(pkt.RequestID); ok {
				cancelFunc := cancelVal.(context.CancelFunc)
				cancelFunc()
				reqCancels.Delete(pkt.RequestID)
				log.Printf("[Agent] Aborted request %s by Hub", pkt.RequestID)
			}

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

				// Create independent context for this request
				reqCtx, cancel := context.WithCancel(ctx)
				reqCancels.Store(pkt.RequestID, cancel)

				go func(id string) {
					defer activeStreams.Delete(id)
					defer reqCancels.Delete(id)
					defer cancel()
					
					completeWrapper := func(rid string, usage *protocol.Usage) string {
						hash, err := store.RecordTransaction(rid, usage.PromptTokens, usage.CompletionTokens)
						if err != nil {
							log.Printf("❌ [Ledger] Failed to record: %v", err)
							return ""
						}
						log.Printf("✅ [Ledger] Recorded tx %s, hash: %s...", rid, hash[:8])
						return hash
					}

					proxy.DoRequest(reqCtx, streamer, safeWriteJSON, completeWrapper)
				}(pkt.RequestID)
			}

			streamer := val.(*proxy.RequestStreamer)
			if err := streamer.WriteChunk(payload); err != nil {
				log.Printf("[Agent] Stream stalled, dropping req %s: %v", pkt.RequestID, err)
				activeStreams.Delete(pkt.RequestID)
			}

		case protocol.TypePong:
		}
	}
}
