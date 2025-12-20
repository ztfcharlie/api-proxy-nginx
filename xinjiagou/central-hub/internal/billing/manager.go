package billing

import (
	"central-hub/internal/protocol"
	"log"
	"sync"
)

// Manager 管理价格和扣费逻辑
type Manager struct {
	currentPriceTable protocol.PriceTable
	mu                sync.RWMutex
}

// NewManager 初始化计费管理器
func NewManager() *Manager {
	// 初始化一个默认价格表
	table := protocol.PriceTable{
		Version: "v1.0.0",
		Models: map[string]protocol.ModelPrice{
			"gpt-3.5-turbo": {InputPrice: 0.50, OutputPrice: 1.50},
			"gpt-4":         {InputPrice: 30.00, OutputPrice: 60.00},
			"dall-e-3":      {PerRequest: 0.040}, // $0.04 per image
		},
	}
	
	return &Manager{
		currentPriceTable: table,
	}
}

// GetCurrentPriceTable 获取当前价格表
func (m *Manager) GetCurrentPriceTable() protocol.PriceTable {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.currentPriceTable
}

// UpdatePriceTable 更新价格表 (通常由管理员触发)
func (m *Manager) UpdatePriceTable(newTable protocol.PriceTable) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.currentPriceTable = newTable
	log.Printf("[Billing] Price table updated to version %s", newTable.Version)
}

// CalculateCost 计算一笔订单的费用
func (m *Manager) CalculateCost(model string, usage *protocol.Usage, priceVer string) float64 {
	// 注意: 这里应该根据 priceVer 去查历史价格表
	// MVP 为了简单，我们假设价格没变，直接查当前表
	// 真实项目需要维护 map[string]PriceTable
	
	m.mu.RLock()
	table := m.currentPriceTable
	m.mu.RUnlock()
	
	price, ok := table.Models[model]
	if !ok {
		// 未知模型，按 0 算或者报错
		return 0
	}

	cost := 0.0
	
	// 1. 文本类计费
	if usage.PromptTokens > 0 {
		cost += (float64(usage.PromptTokens) / 1000000.0) * price.InputPrice
	}
	if usage.CompletionTokens > 0 {
		cost += (float64(usage.CompletionTokens) / 1000000.0) * price.OutputPrice
	}

	// 2. 图片类计费
	if usage.ImageCount > 0 {
		cost += float64(usage.ImageCount) * price.PerRequest
	}

	// 3. 视频/音频类 (暂略)

	return cost
}
