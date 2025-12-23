package router

import (
	"central-hub/internal/protocol"
	"context"
	"errors"
)

type AgentInfo struct {
	ID        string
	Instances []protocol.InstanceConfig // 存储所有实例
	Tier      string                    // Agent 整体等级 (DB中存储)
	Load      int                       // Agent 整体负载
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
	UpdateAgent(id string, info AgentInfo)
	RemoveAgent(id string)
}

var ErrNoAgents = errors.New("no agents available")
