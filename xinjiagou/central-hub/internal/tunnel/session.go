package tunnel

import (
	"central-hub/internal/config"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type AgentSession struct {
	Conn    *websocket.Conn
	writeMu sync.Mutex
	cfg     *config.Config

	// 补丁: 记录该 Agent 正在处理的请求 ID
	activeReqs   map[string]bool
	activeReqsMu sync.Mutex // 确保这里是 大写 Mu
}

func (s *AgentSession) AddReq(reqID string) {
	s.activeReqsMu.Lock()
	defer s.activeReqsMu.Unlock()
	s.activeReqs[reqID] = true
}

func (s *AgentSession) RemoveReq(reqID string) {
	s.activeReqsMu.Lock()
	defer s.activeReqsMu.Unlock()
	delete(s.activeReqs, reqID)
}

func (s *AgentSession) SafeWrite(v interface{}) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	s.Conn.SetWriteDeadline(time.Now().Add(s.cfg.WSWriteWait))
	return s.Conn.WriteJSON(v)
}
