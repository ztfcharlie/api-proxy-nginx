package tunnel

import (
	"central-hub/internal/protocol"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type TunnelServer struct {
	upgrader websocket.Upgrader
	agents   map[string]*websocket.Conn
	mu       sync.RWMutex
	pendingRequests sync.Map
}

func NewTunnelServer() *TunnelServer {
	return &TunnelServer{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		agents: make(map[string]*websocket.Conn),
	}
}

// DispatchRequest (保持不变)
func (s *TunnelServer) DispatchRequest(agentID string, reqID string, payload protocol.HttpRequestPayload) (<-chan protocol.Packet, error) {
	s.mu.RLock()
	conn, exists := s.agents[agentID]
	s.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("agent %s not connected", agentID)
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	packet := protocol.Packet{
		Type:      protocol.TypeRequest,
		RequestID: reqID,
		Payload:   payloadBytes,
	}

	respChan := make(chan protocol.Packet, 100)
	s.pendingRequests.Store(reqID, respChan)

	s.mu.Lock()
	err = conn.WriteJSON(packet)
	s.mu.Unlock()

	if err != nil {
		s.pendingRequests.Delete(reqID)
		return nil, fmt.Errorf("failed to send packet: %v", err)
	}

	return respChan, nil
}

func (s *TunnelServer) CleanupRequest(reqID string) {
	s.pendingRequests.Delete(reqID)
}

func (s *TunnelServer) HandleConnect(w http.ResponseWriter, r *http.Request) {
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
	defer conn.Close()

	// === 开始握手认证流程 ===
	if err := s.handshake(conn, agentID); err != nil {
		log.Printf("[Hub] Auth failed for %s: %v", agentID, err)
		// 发送错误消息给客户端 (可选)
		conn.WriteMessage(websocket.CloseMessage, []byte{})
		return
	}
	// === 认证通过 ===

	log.Printf("[Hub] Agent authenticated: %s", agentID)
	s.registerAgent(agentID, conn)
	defer s.unregisterAgent(agentID) // 确保断开时注销

	// 进入正常消息循环
	s.readLoop(agentID, conn)
}

// handshake 执行挑战-响应认证
func (s *TunnelServer) handshake(conn *websocket.Conn, agentID string) error {
	// 1. 设置超时时间 (5秒内必须完成认证)
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	// 2. 等待 Register 包
	_, msg, err := conn.ReadMessage()
	if err != nil {
		return err
	}
	var packet protocol.Packet
	if err := json.Unmarshal(msg, &packet); err != nil {
		return err
	}
	if packet.Type != protocol.TypeRegister {
		return fmt.Errorf("expected REGISTER, got %s", packet.Type)
	}

	var regPayload protocol.RegisterPayload
	if err := json.Unmarshal(packet.Payload, &regPayload); err != nil {
		return err
	}
	
	// TODO: 这里应该查数据库，检查 regPayload.PublicKey 是否属于 agentID
	// 现在先假设任何 Key 都合法 (Mock)
	agentPubKey := regPayload.PublicKey 

	// 3. 生成并发送 Nonce
	nonce := generateNonce()
	challengePayload, _ := json.Marshal(protocol.AuthChallengePayload{Nonce: nonce})
	if err := conn.WriteJSON(protocol.Packet{
		Type:    protocol.TypeAuthChallenge,
		Payload: challengePayload,
	}); err != nil {
		return err
	}

	// 4. 等待 AuthResponse (签名)
	_, msg, err = conn.ReadMessage()
	if err != nil {
		return err
	}
	if err := json.Unmarshal(msg, &packet); err != nil {
		return err
	}
	if packet.Type != protocol.TypeAuthResponse {
		return fmt.Errorf("expected AUTH_RESPONSE, got %s", packet.Type)
	}

	var authPayload protocol.AuthResponsePayload
	if err := json.Unmarshal(packet.Payload, &authPayload); err != nil {
		return err
	}

	// 5. 验证签名
	if err := verifySignature(agentPubKey, nonce, authPayload.Signature); err != nil {
		return err
	}

	// 认证成功，清除超时限制
	conn.SetReadDeadline(time.Time{})
	return nil
}

func (s *TunnelServer) registerAgent(id string, conn *websocket.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if oldConn, exists := s.agents[id]; exists {
		oldConn.Close()
	}
	s.agents[id] = conn
}

func (s *TunnelServer) unregisterAgent(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if conn, exists := s.agents[id]; exists {
		// 为了防止把新连接挤掉，这里可以加个判断 (如果是同一个conn才删)
		// 简单起见先直接删
		conn.Close()
		delete(s.agents, id)
	}
}

func (s *TunnelServer) readLoop(agentID string, conn *websocket.Conn) {
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var packet protocol.Packet
		if err := json.Unmarshal(message, &packet); err != nil {
			log.Printf("[Hub] Invalid packet from %s: %v", agentID, err)
			continue
		}

		s.handlePacket(agentID, packet)
	}
}

func (s *TunnelServer) handlePacket(agentID string, packet protocol.Packet) {
	switch packet.Type {
	case protocol.TypePing:
		// TODO: Pong
	case protocol.TypeResponse:
		if ch, ok := s.pendingRequests.Load(packet.RequestID); ok {
			select {
			case ch.(chan protocol.Packet) <- packet:
			case <-time.After(100 * time.Millisecond):
				log.Printf("[Hub] Warning: response channel full for %s", packet.RequestID)
			}
		}
	default:
		// Register 等包在 handshake 后不应再出现，忽略
	}
}
