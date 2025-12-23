package router

import (
	"central-hub/internal/protocol"
	"context"
	"errors"
	"time"
)

type InstanceStatus struct {
	Config       protocol.InstanceConfig
	BrokenUntil  time.Time
	FailureCount int
}

type AgentInfo struct {
	ID        string
	Instances map[string]*InstanceStatus // ID -> Status
	Tier      string
	Load      int
}

type SelectCriteria struct {
	Provider    string
	Model       string
	MinTier     string
	ForceAgents []string
}

// SelectResult 包含选中的 Agent ID 和具体的 Instance ID
type SelectResult struct {
	AgentID    string
	InstanceID string
}

type Router interface {
	Select(ctx context.Context, criteria SelectCriteria) (*SelectResult, error)
	UpdateAgent(id string, config []protocol.InstanceConfig, tier string) // Changed signature
	RemoveAgent(id string)
	Feedback(agentID, instanceID, errorType string, retryAfter int) // 新增: 熔断反馈
}

var ErrNoAgents = errors.New("no agents available")
