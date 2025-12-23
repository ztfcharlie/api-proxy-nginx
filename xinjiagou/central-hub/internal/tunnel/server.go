package tunnel

import (
	"central-hub/internal/cache"
	"central-hub/internal/config"
	"central-hub/internal/db"
	"central-hub/internal/protocol"
	"central-hub/internal/router"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/time/rate"
)

type TunnelServer struct {
	cfg              *config.Config
	redis            *cache.RedisStore
	db               *db.DB
	Router           *router.SmartRouter
	upgrader         websocket.Upgrader
	agents           map[string]*AgentSession
	mu               sync.RWMutex
	pendingRequests  sync.Map
	limitSem         chan struct{}
	handshakeLimiter *rate.Limiter
}

func NewTunnelServer(cfg *config.Config, rdb *cache.RedisStore, database *db.DB) *TunnelServer {
	return &TunnelServer{
		cfg:              cfg,
		redis:            rdb,
		db:               database,
		Router:           router.NewSmartRouter(),
		upgrader:         websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		agents:           make(map[string]*AgentSession),
		limitSem:         make(chan struct{}, cfg.MaxAgents),
		handshakeLimiter: rate.NewLimiter(100, 50),
	}
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
	if err != nil {
		log.Printf("Upgrade error: %v", err)
		return
	}

	conn.SetReadLimit(s.cfg.WSReadLimit)

	instances, tier, err := s.handshake(conn, agentID)
	if err != nil {
		log.Printf("[Hub] Auth failed for %s: %v", agentID, err)
		conn.Close()
		return
	}
	
	log.Printf("[Hub] Agent %s connected. Instances: %d, Tier: %s", agentID, len(instances), tier)

	session := &AgentSession{
		Conn:       conn,
		cfg:        s.cfg,
		Instances:  instances,
		activeReqs: make(map[string]bool),
	}
	s.registerAgent(agentID, session)

	// Update Router
	s.Router.UpdateAgent(agentID, router.AgentInfo{
		ID:        agentID, 
		Instances: instances,
		Tier:      tier,
	})

	go func() {
		if err := s.redis.RegisterAgent(context.Background(), agentID); err != nil {
			log.Printf("[Redis] Failed to register agent %s: %v", agentID, err)
		}
	}()

	defer func() {
		s.unregisterAgent(agentID)
		s.Router.RemoveAgent(agentID)
		s.CloseSessionAndNotify(agentID, session)
		s.redis.UnregisterAgent(context.Background(), agentID)
	}()

	s.readLoop(agentID, session)
}

func (s *TunnelServer) handshake(conn *websocket.Conn, agentID string) ([]protocol.InstanceConfig, string, error) {
	conn.SetReadDeadline(time.Now().Add(s.cfg.WSWriteWait))
	conn.SetWriteDeadline(time.Now().Add(s.cfg.WSWriteWait))

	_, msg, err := conn.ReadMessage()
	if err != nil {
		return nil, "", err
	}
	var packet protocol.Packet
	if err := json.Unmarshal(msg, &packet); err != nil {
		return nil, "", err
	}
	if packet.Type != protocol.TypeRegister {
		return nil, "", fmt.Errorf("expected REGISTER")
	}

	var regPayload protocol.RegisterPayload
	json.Unmarshal(packet.Payload, &regPayload)
	agentPubKey := regPayload.PublicKey
	instances := regPayload.Instances // 获取实例列表

	// 校验公钥
	tier, err := s.db.RegisterOrValidateAgent(agentID, agentPubKey)
	if err != nil {
		return nil, "", fmt.Errorf("key validation failed: %v", err)
	}

	nonce := generateNonce()
	challengePayload, _ := json.Marshal(protocol.AuthChallengePayload{Nonce: nonce})
	if err := conn.WriteJSON(protocol.Packet{Type: protocol.TypeAuthChallenge, Payload: challengePayload}); err != nil {
		return nil, "", err
	}

	conn.SetReadDeadline(time.Now().Add(s.cfg.WSWriteWait))
	_, msg, err = conn.ReadMessage()
	if err != nil {
		return nil, "", err
	}
	json.Unmarshal(msg, &packet)

	var authPayload protocol.AuthResponsePayload
	json.Unmarshal(packet.Payload, &authPayload)

	if err := verifySignature(agentPubKey, nonce, authPayload.Signature); err != nil {
		return nil, "", err
	}

	conn.SetReadDeadline(time.Time{})
	conn.SetWriteDeadline(time.Time{})
	return instances, tier, nil
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
	delete(s.agents, id)
}

// SelectAgent wraps the router selection
func (s *TunnelServer) SelectAgent(ctx context.Context, provider, model string) (*router.SelectResult, error) {
	return s.Router.Select(ctx, router.SelectCriteria{Provider: provider, Model: model})
}
