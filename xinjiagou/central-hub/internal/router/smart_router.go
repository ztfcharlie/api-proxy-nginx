package router

import (
	"central-hub/internal/protocol"
	"context"
	"sync"
	"sync/atomic"
	"time"
)

type SmartRouter struct {
	mu          sync.Mutex // Protects Write-side only
	agentsStore atomic.Value // Stores map[string]AgentInfo
	counter     uint64
}

func NewSmartRouter() *SmartRouter {
	r := &SmartRouter{}
	r.agentsStore.Store(make(map[string]AgentInfo))
	return r
}

func (r *SmartRouter) UpdateAgent(id string, configs []protocol.InstanceConfig, tier string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	// 1. Load current snapshot
	oldMap := r.agentsStore.Load().(map[string]AgentInfo)
	
	// 2. Clone map (Shallow copy of map structure, values are copied)
	newMap := make(map[string]AgentInfo, len(oldMap)+1)
	for k, v := range oldMap {
		newMap[k] = v
	}
	
	// 3. Modify new map
	info, exists := newMap[id]
	if !exists {
		info = AgentInfo{ID: id, Instances: make(map[string]*InstanceStatus)}
	}
	
	// Sync instances logic (Same as before)
	newInstanceMap := make(map[string]*InstanceStatus)
	for _, cfg := range configs {
		status := &InstanceStatus{Config: cfg}
		if oldStatus, ok := info.Instances[cfg.ID]; ok {
			status.BrokenUntil = oldStatus.BrokenUntil
			status.FailureCount = oldStatus.FailureCount
		}
		newInstanceMap[cfg.ID] = status
	}
	info.Instances = newInstanceMap
	info.Tier = tier
	
	newMap[id] = info
	
	// 4. Store atomically
	r.agentsStore.Store(newMap)
}

func (r *SmartRouter) RemoveAgent(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	oldMap := r.agentsStore.Load().(map[string]AgentInfo)
	newMap := make(map[string]AgentInfo, len(oldMap))
	for k, v := range oldMap {
		if k != id {
			newMap[k] = v
		}
	}
	r.agentsStore.Store(newMap)
}

func (r *SmartRouter) Feedback(agentID, instanceID, errorType string, retryAfter int) {
	// Feedback needs to modify state. 
	// In COW model, we have to Lock -> Copy -> Modify -> Store even for status update?
	// This is expensive for high-frequency feedback (like 429 storm).
	// Solution: InstanceStatus is a *Pointer*. We can modify the struct in place!
	// But we need to make sure we are thread-safe.
	// Since we only modify atomic fields or use a small lock inside InstanceStatus?
	// Or we keep a global lock for Feedback?
	// Given Feedback is rare (hopefully), Lock is fine.
	// Wait, if we use COW, 'Select' gets a snapshot. If 'Feedback' modifies the pointer, 'Select' sees it immediately.
	// So we don't need to COW the whole map for Feedback, just locate the pointer.
	// BUT, we need to locate it from the current atomic map.
	
	agents := r.agentsStore.Load().(map[string]AgentInfo)
	agent, ok := agents[agentID]
	if !ok { return }
	
	_, ok = agent.Instances[instanceID]
	if !ok { return }
	
	// We need to protect InstanceStatus modification.
	// Since we don't have a lock on InstanceStatus, we might have race.
	// Let's add a mu to InstanceStatus? No, it's defined in router.go interface.
	
	// Let's use the big lock for now to be safe, implementing COW update.
	// It's safer.
	r.UpdateStatus(agentID, instanceID, errorType, retryAfter)
}

// UpdateStatus is a helper for Feedback to do COW update
func (r *SmartRouter) UpdateStatus(agentID, instanceID, errorType string, retryAfter int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	oldMap := r.agentsStore.Load().(map[string]AgentInfo)
	newMap := make(map[string]AgentInfo, len(oldMap))
	for k, v := range oldMap { newMap[k] = v }
	
	// Deep copy needed? 
	// AgentInfo contains map[string]*InstanceStatus.
	// If we modify the map itself, we need deep copy.
	// If we modify *InstanceStatus content, we don't.
	// BUT, if we modify content in place, we race with readers.
	// So we should clone the InstanceStatus.
	
	info, ok := newMap[agentID]
	if !ok { return }
	
	// Clone instances map
	newInstMap := make(map[string]*InstanceStatus, len(info.Instances))
	for k, v := range info.Instances {
		// Clone status object
		s := *v
		newInstMap[k] = &s
	}
	
	status, ok := newInstMap[instanceID]
	if !ok { return }
	
	// Logic
	if errorType == "" {
		status.FailureCount = 0
	} else if errorType == "rate_limit" {
		duration := time.Duration(retryAfter) * time.Second
		if duration == 0 { duration = 60 * time.Second }
		status.BrokenUntil = time.Now().Add(duration)
	} else {
		status.FailureCount++
		if status.FailureCount >= 3 {
			status.BrokenUntil = time.Now().Add(30 * time.Second)
		}
	}
	
	info.Instances = newInstMap
	newMap[agentID] = info
	r.agentsStore.Store(newMap)
}

func (r *SmartRouter) Select(ctx context.Context, c SelectCriteria) (*SelectResult, error) {
	// No Lock!
	agents := r.agentsStore.Load().(map[string]AgentInfo)

	var candidates []*SelectResult

	for agentID, agent := range agents {
		// Rule 1.1: Force Binding
		if len(c.ForceAgents) > 0 {
			found := false
			for _, forceID := range c.ForceAgents {
				if agentID == forceID { found = true; break }
			}
			if !found { continue }
		}

		// Iterate over instances to find match
		for _, status := range agent.Instances {
			// Circuit Breaker Check
			if time.Now().Before(status.BrokenUntil) {
				continue // 熔断中，跳过
			}
			
			inst := status.Config

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

	if len(candidates) == 0 && c.Model != "" {
		// Fallback: Try to find ANY agent supporting this provider, ignoring model
		// This handles "unknown" models or new models not yet in Agent config
		for agentID, agent := range agents {
			for _, status := range agent.Instances {
				if time.Now().Before(status.BrokenUntil) { continue }
				inst := status.Config
				if inst.Provider != c.Provider { continue }
				
				// Found a provider match!
				candidates = append(candidates, &SelectResult{
					AgentID:    agentID,
					InstanceID: inst.ID,
				})
			}
		}
	}

	if len(candidates) == 0 {
		return nil, ErrNoAgents
	}

	// 2. Load Balancing (Round-Robin)
	// Atomic increment avoids global lock contention of math/rand
	next := atomic.AddUint64(&r.counter, 1)
	idx := int(next % uint64(len(candidates)))
	
	return candidates[idx], nil
}

func isTierSufficient(agentTier, minTier string) bool {
	tiers := map[string]int{"T0": 3, "T1": 2, "T2": 1, "T3": 0} 
	agentVal := tiers[agentTier]
	minVal := tiers[minTier]
	return agentVal >= minVal
}
