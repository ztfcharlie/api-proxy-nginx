package tunnel

import (
	"central-hub/internal/protocol"
	"encoding/json"
	"log"
	"runtime/debug"
	"time"
)

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
			
			var resp protocol.HttpResponsePayload
			json.Unmarshal(packet.Payload, &resp)
			if resp.IsFinal {
				session.RemoveReq(packet.RequestID)
			}
		}
	}
}
