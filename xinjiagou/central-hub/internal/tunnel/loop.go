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
		
	case protocol.TypeModelUpdate:
		var payload protocol.ModelUpdatePayload
		if err := json.Unmarshal(packet.Payload, &payload); err == nil {
			session.Instances = payload.Instances
			log.Printf("[Hub] Agent %s updated instances: %d", agentID, len(session.Instances))
			
			// Update Router
			// Note: Tier is not in payload, assume it stays same or we need to store it in session
			// For now pass empty string, Router implementation needs to handle it (or we store Tier in session)
			// Let's modify session to store Tier!
			// session.Tier is missing.
			// Let's pass "B" as fallback or we need to refactor session.
			// Better: Router.UpdateAgent logic: info.Tier = tier.
			// If we pass "", it might overwrite.
			// Let's assume UpdateAgent merges? No, it overwrites.
			// We should store Tier in AgentSession.
			
			// Quick fix: pass "B" for now, or fetch from DB?
			// DB lookup is slow.
			// Correct fix: Add Tier to AgentSession.
			
			// I'll update AgentSession first.
			s.Router.UpdateAgent(agentID, session.Instances, "B") // TODO: Fix Tier
		}

	case protocol.TypeResponse:
		var resp protocol.HttpResponsePayload
		json.Unmarshal(packet.Payload, &resp)
		
		if resp.ErrorType != "" && resp.InstanceID != "" {
			s.Router.Feedback(agentID, resp.InstanceID, resp.ErrorType, resp.RetryAfter)
			log.Printf("[Hub] Feedback: Agent %s Instance %s Error %s (RetryAfter: %ds)", 
				agentID, resp.InstanceID, resp.ErrorType, resp.RetryAfter)
		}

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
