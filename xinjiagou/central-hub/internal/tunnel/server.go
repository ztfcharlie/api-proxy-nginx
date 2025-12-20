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

// TunnelServer 负责管理所有的 Agent 连接
type TunnelServer struct {
	upgrader websocket.Upgrader
	agents   map[string]*websocket.Conn
	mu       sync.RWMutex

	// pendingRequests 用于暂存正在处理中的请求
	// Key: RequestID, Value: 一个 channel，用于接收从 Agent 回来的数据包
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

// DispatchRequest 将 HTTP 请求转发给指定的 Agent，并返回一个 channel 用于读取响应
// 返回值: 接收 Response 数据包的 channel, 错误信息
func (s *TunnelServer) DispatchRequest(agentID string, reqID string, payload protocol.HttpRequestPayload) (<-chan protocol.Packet, error) {
	s.mu.RLock()
	conn, exists := s.agents[agentID]
	s.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("agent %s not connected", agentID)
	}

	// 1. 序列化 payload
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	// 2. 构造 WebSocket 数据包
	packet := protocol.Packet{
		Type:      protocol.TypeRequest,
		RequestID: reqID,
		Payload:   payloadBytes,
	}

	// 3. 创建一个 channel 用于接收响应 (缓冲区设为 100，防止阻塞)
	respChan := make(chan protocol.Packet, 100)
	s.pendingRequests.Store(reqID, respChan)

	// 4. 发送给 Agent
	s.mu.Lock() // 写锁，防止并发写 WS 导致 panic
	err = conn.WriteJSON(packet)
	s.mu.Unlock()

	if err != nil {
		s.pendingRequests.Delete(reqID) // 发送失败，清理垃圾
		return nil, fmt.Errorf("failed to send packet: %v", err)
	}

	return respChan, nil
}

// CleanupRequest 清理请求资源 (当 HTTP 请求结束时调用)
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

	log.Printf("[Hub] Agent connected: %s", agentID)
	s.registerAgent(agentID, conn)
	s.readLoop(agentID, conn)
	s.unregisterAgent(agentID)
	log.Printf("[Hub] Agent disconnected: %s", agentID)
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
	case protocol.TypeRegister:
		log.Printf("[Hub] Received REGISTER from %s", agentID)
	case protocol.TypeResponse:
		// 收到 Agent 回传的响应数据
		// 根据 ReqID 找到对应的 channel，塞进去
		if ch, ok := s.pendingRequests.Load(packet.RequestID); ok {
			// 这里需要非阻塞发送，防止 channel 满了导致 WS 循环卡死
			select {
			case ch.(chan protocol.Packet) <- packet:
			case <-time.After(100 * time.Millisecond):
				log.Printf("[Hub] Warning: response channel full for %s, dropping packet", packet.RequestID)
			}
		} else {
			// 可能是请求已经超时结束了，收到迟到的包，直接丢弃
		}
	default:
		log.Printf("[Hub] Unknown packet type from %s: %s", agentID, packet.Type)
	}
}