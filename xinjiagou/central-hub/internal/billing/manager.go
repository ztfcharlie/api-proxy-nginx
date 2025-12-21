package billing

import (
	"central-hub/internal/protocol"
	"log"
	"sync"
)

type Manager struct {
	currentPriceTable protocol.PriceTable
	mu                sync.RWMutex
}

func NewManager() *Manager {
	table := protocol.PriceTable{
		Version: "v1.0.0",
		Models: map[string]protocol.ModelPrice{
			"gpt-3.5-turbo": {InputPrice: 0.50, OutputPrice: 1.50},
			"gpt-4":         {InputPrice: 30.00, OutputPrice: 60.00},
			"dall-e-3":      {PerRequest: 0.040},
		},
	}
	
	return &Manager{
		currentPriceTable: table,
	}
}

func (m *Manager) GetCurrentPriceTable() protocol.PriceTable {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.currentPriceTable
}

func (m *Manager) UpdatePriceTable(newTable protocol.PriceTable) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.currentPriceTable = newTable
	log.Printf("[Billing] Price table updated to version %s", newTable.Version)
}

// CalculateCost 计算费用 (修复负数漏洞)
func (m *Manager) CalculateCost(model string, usage *protocol.Usage, priceVer string) float64 {
	m.mu.RLock()
	table := m.currentPriceTable
	m.mu.RUnlock()
	
	// 1. 安全校验: 负数归零，防止攻击
	sanitize := func(n int) int {
		if n < 0 { return 0 }
		return n
	}

	price, ok := table.Models[model]
	if !ok {
		return 0
	}

	cost := 0.0
	
	if usage.PromptTokens > 0 {
		cost += (float64(sanitize(usage.PromptTokens)) / 1000000.0) * price.InputPrice
	}
	if usage.CompletionTokens > 0 {
		cost += (float64(sanitize(usage.CompletionTokens)) / 1000000.0) * price.OutputPrice
	}

	if usage.ImageCount > 0 {
		cost += float64(sanitize(usage.ImageCount)) * price.PerRequest
	}

	// 视频音频同理...

	return cost
}