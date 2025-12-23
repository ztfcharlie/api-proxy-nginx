package router

import (
	"context"
	"math/rand"
	"sync"
	"time"
)

type SmartRouter struct {
	mu     sync.RWMutex
	agents map[string]AgentInfo
}

func NewSmartRouter() *SmartRouter {
	rand.Seed(time.Now().UnixNano())
	return &SmartRouter{
		agents: make(map[string]AgentInfo),
	}
}

func (r *SmartRouter) UpdateAgent(id string, info AgentInfo) {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	// Preserve existing load if updating same agent
	if old, exists := r.agents[id]; exists {
		info.Load = old.Load
	}
	
	r.agents[id] = info
}

func (r *SmartRouter) RemoveAgent(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.agents, id)
}

// UpdateLoad updates the active request count for an agent
func (r *SmartRouter) UpdateLoad(id string, delta int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if agent, exists := r.agents[id]; exists {
		agent.Load += delta
		r.agents[id] = agent
	}
}

func (r *SmartRouter) Select(ctx context.Context, c SelectCriteria) (*SelectResult, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var candidates []*SelectResult

	for agentID, agent := range r.agents {
		// Rule 1.1: Force Binding
		if len(c.ForceAgents) > 0 {
			found := false
			for _, forceID := range c.ForceAgents {
				if agentID == forceID { found = true; break }
			}
			if !found { continue }
		}

		// Iterate over instances to find match
		for _, inst := range agent.Instances {
			// Check Provider
			if inst.Provider != c.Provider {
				continue
			}
			
			// Check Model
			modelFound := false
			for _, m := range inst.Models {
				if m == c.Model { modelFound = true; break }
			}
			if !modelFound { continue }

			// Check Tier (Instance Tier)
			if c.MinTier != "" && !isTierSufficient(inst.Tier, c.MinTier) {
				continue
			}

			// Found a candidate instance
			candidates = append(candidates, &SelectResult{
				AgentID:    agentID,
				InstanceID: inst.ID,
			})
		}
	}

	if len(candidates) == 0 {
		return nil, ErrNoAgents
	}

	// 2. Load Balancing (Random for now)
	// Improvement: Should consider Agent Load or Instance RPM
	idx := rand.Intn(len(candidates))
	return candidates[idx], nil
}

func isTierSufficient(agentTier, minTier string) bool {
	tiers := map[string]int{"T0": 3, "T1": 2, "T2": 1, "T3": 0} // Update Tier Logic
	
	agentVal := tiers[agentTier]
	minVal := tiers[minTier]

	return agentVal >= minVal
}
