package tunnel

import (
	"central-hub/internal/protocol"
	"encoding/json"
	"fmt"
	"log"
)

// InitRequest 初始化请求，并返回一个 channel 用于接收响应
func (s *TunnelServer) InitRequest(agentID string, reqID string) (<-chan protocol.Packet, error) {
	s.mu.RLock()
	session, exists := s.agents[agentID]
	s.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("agent %s not connected", agentID)
	}

	respChan := make(chan protocol.Packet, 100)
	s.pendingRequests.Store(reqID, respChan)
	
	session.AddReq(reqID)
	
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

// CloseSessionAndNotify 关闭连接并通知所有等待的请求
func (s *TunnelServer) CloseSessionAndNotify(agentID string, session *AgentSession) {
	session.Conn.Close()
	
	session.activeReqsMu.Lock()
	defer session.activeReqsMu.Unlock()
	
	for reqID := range session.activeReqs {
		if ch, ok := s.pendingRequests.Load(reqID); ok {
			close(ch.(chan protocol.Packet))
			s.pendingRequests.Delete(reqID)
			log.Printf("[Hub] Fast-fail req %s because agent %s disconnected", reqID, agentID)
		}
	}
}
