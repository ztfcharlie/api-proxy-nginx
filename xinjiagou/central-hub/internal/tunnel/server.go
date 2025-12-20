package tunnel

import (
	"central-hub/internal/config"
	"central-hub/internal/protocol"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"runtime/debug"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/time/rate"
)

type AgentSession struct {
	Conn *websocket.Conn
	writeMu sync.Mutex
	cfg *config.Config
}

func (s *AgentSession) SafeWrite(v interface{}) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	s.Conn.SetWriteDeadline(time.Now().Add(s.cfg.WSWriteWait))
	return s.Conn.WriteJSON(v)
}

type TunnelServer struct {
	cfg      *config.Config
	upgrader websocket.Upgrader
	agents   map[string]*AgentSession
	mu       sync.RWMutex
	pendingRequests sync.Map
	limitSem chan struct{}
	handshakeLimiter *rate.Limiter
}

func NewTunnelServer(cfg *config.Config) *TunnelServer {
	return &TunnelServer{
		cfg: cfg,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		agents:   make(map[string]*AgentSession),
		limitSem: make(chan struct{}, cfg.MaxAgents),
		handshakeLimiter: rate.NewLimiter(100, 50),
	}
}

// InitRequest 初始化请求，并返回一个 channel 用于接收响应
func (s *TunnelServer) InitRequest(agentID string, reqID string) (<-chan protocol.Packet, error) {
	s.mu.RLock()
	_, exists := s.agents[agentID]
	s.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("agent %s not connected", agentID)
	}

	respChan := make(chan protocol.Packet, 100)
	s.pendingRequests.Store(reqID, respChan)
	return respChan, nil
}

// SendRequestChunk 发送请求的一个分片
func (s *TunnelServer) SendRequestChunk(agentID string, reqID string, payload protocol.HttpRequestPayload) error {
	s.mu.RLock()
	session, exists := s.agents[agentID]
	s.mu.RUnlock()

	if !exists {
		return fmt.Errorf("agent disconnected")
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	packet := protocol.Packet{
		Type:      protocol.TypeRequest,
		RequestID: reqID,
		Payload:   payloadBytes,
	}

	return session.SafeWrite(packet)
}

func (s *TunnelServer) CleanupRequest(reqID string) {
	s.pendingRequests.Delete(reqID)
}

func (s *TunnelServer) HandleConnect(w http.ResponseWriter, r *http.Request) {
	if !s.handshakeLimiter.Allow() {
		http.Error(w, "Too many connection attempts", http.StatusTooManyRequests)
		return
	}

	select {
	case s.limitSem <- struct{}{}:
	default:
		http.Error(w, "Server busy", http.StatusServiceUnavailable)
		return
	}
	defer func() { <-s.limitSem }()

	agentID := r.URL.Query().Get("agent_id")
	if agentID == "" {
		http.Error(w, "Missing agent_id", http.StatusBadRequest)
		return
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil { return }
	defer conn.Close()

	// 补丁: 这里的限制可以调小了，因为我们强制分片了
	conn.SetReadLimit(s.cfg.WSReadLimit) 

	if err := s.handshake(conn, agentID); err != nil {
		log.Printf("[Hub] Auth failed for %s: %v", agentID, err)
		return
	}

	session := &AgentSession{Conn: conn, cfg: s.cfg}
	s.registerAgent(agentID, session)
	defer s.unregisterAgent(agentID)

	s.readLoop(agentID, session)
}

func (s *TunnelServer) handshake(conn *websocket.Conn, agentID string) error {
	conn.SetReadDeadline(time.Now().Add(s.cfg.WSWriteWait))
	conn.SetWriteDeadline(time.Now().Add(s.cfg.WSWriteWait))

	_, msg, err := conn.ReadMessage()
	if err != nil { return err }
	var packet protocol.Packet
	if err := json.Unmarshal(msg, &packet); err != nil { return err }
	if packet.Type != protocol.TypeRegister { return fmt.Errorf("expected REGISTER") }

	var regPayload protocol.RegisterPayload
	json.Unmarshal(packet.Payload, &regPayload)
	agentPubKey := regPayload.PublicKey 

	nonce := generateNonce()
	challengePayload, _ := json.Marshal(protocol.AuthChallengePayload{Nonce: nonce})
	if err := conn.WriteJSON(protocol.Packet{Type: protocol.TypeAuthChallenge, Payload: challengePayload}); err != nil { return err }

	conn.SetReadDeadline(time.Now().Add(s.cfg.WSWriteWait))
	_, msg, err = conn.ReadMessage()
	if err != nil { return err }
	json.Unmarshal(msg, &packet)
	
	var authPayload protocol.AuthResponsePayload
	json.Unmarshal(packet.Payload, &authPayload)

	if err := verifySignature(agentPubKey, nonce, authPayload.Signature); err != nil { return err }

	conn.SetReadDeadline(time.Time{})
	conn.SetWriteDeadline(time.Time{})
	return nil
}

func (s *TunnelServer) registerAgent(id string, session *AgentSession) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if old, exists := s.agents[id]; exists {
		old.Conn.Close()
	}
	s.agents[id] = session
}

func (s *TunnelServer) unregisterAgent(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if session, exists := s.agents[id]; exists {
		session.Conn.Close()
		delete(s.agents, id)
	}
}

func (s *TunnelServer) readLoop(agentID string, session *AgentSession) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[Hub] PANIC in agent %s connection: %v\nStack: %s", agentID, r, debug.Stack())
			session.Conn.Close()
		}
	}()

	pongWait := s.cfg.WSPingWait
	session.Conn.SetReadDeadline(time.Now().Add(pongWait))

	for {
		_, message, err := session.Conn.ReadMessage()
		if err != nil {
			log.Printf("[Hub] Read error from %s: %v", agentID, err)
			break
		}

		session.Conn.SetReadDeadline(time.Now().Add(pongWait))

		var packet protocol.Packet
		if err := json.Unmarshal(message, &packet); err != nil {
			continue
		}

		s.handlePacket(agentID, session, packet)
	}
}

func (s *TunnelServer) handlePacket(agentID string, session *AgentSession, packet protocol.Packet) {
	switch packet.Type {
	case protocol.TypePing:
		pongPacket := protocol.Packet{Type: protocol.TypePong}
		session.SafeWrite(pongPacket)
		
	case protocol.TypeResponse:
		if ch, ok := s.pendingRequests.Load(packet.RequestID); ok {
			select {
			case ch.(chan protocol.Packet) <- packet:
			case <-time.After(100 * time.Millisecond):
				log.Printf("[Hub] Warning: response channel full")
			}
		}
	}
}
