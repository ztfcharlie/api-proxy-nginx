package billing

import (
	"central-hub/internal/protocol"
	"central-hub/internal/db"
	"log"
	"sync"

	"github.com/shopspring/decimal"
)

type Manager struct {
	currentVersion string
	priceTables    map[string]protocol.PriceTable
	mu             sync.RWMutex
	db             *db.DB
}

func NewManager(database *db.DB) *Manager {
	// Initial load
	v1 := "v1.0.0"
	table := protocol.PriceTable{
		Version: v1,
		Models: map[string]protocol.ModelPrice{
			"gpt-3.5-turbo": {InputPrice: 0.50, OutputPrice: 1.50},
			"gpt-4":         {InputPrice: 30.00, OutputPrice: 60.00},
			"dall-e-3":      {PerRequest: 0.040},
		},
	}
	
m := &Manager{
		currentVersion: v1,
		priceTables:    map[string]protocol.PriceTable{v1: table},
		db:             database,
	}
	m.ReloadFromDB()
	return m
}

func (m *Manager) ReloadFromDB() error {
	// TODO: Fetch from price_tables table
	// For MVP we skip SQL implementation details but provide the hook
	log.Println("[Billing] Reloading prices from DB...")
	return nil
}

func (m *Manager) GetCurrentPriceTable() protocol.PriceTable {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.priceTables[m.currentVersion]
}

func (m *Manager) UpdatePriceTable(newTable protocol.PriceTable) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.priceTables[newTable.Version] = newTable
	m.currentVersion = newTable.Version
	log.Printf("[Billing] Price table updated to version %s", newTable.Version)
}

// CalculateCost 计算费用 (使用 decimal 高精度)
func (m *Manager) CalculateCost(model string, usage *protocol.Usage, priceVer string) float64 {
	m.mu.RLock()
	// Version Match Logic
	table, ok := m.priceTables[priceVer]
	if !ok {
		// Fallback to current if version not found (should be rare)
		log.Printf("[Billing] Warning: Price version %s not found, using current %s", priceVer, m.currentVersion)
		table = m.priceTables[m.currentVersion]
	}
	m.mu.RUnlock()
	
sanitize := func(n int) int64 {		if n < 0 { return 0 }
		// Anti-Cheat: Hard limit per request (e.g. 1M tokens)
		// GPT-4 Turbo 128k context, so 1M is safe upper bound for sanity check
		if n > 1000000 {
			log.Printf("[Billing] Security Alert: Abnormal usage reported! %d", n)
			return 1000000 // Cap it, or return error? For MVP cap it.
		}
		return int64(n)
	}

	price, ok := table.Models[model]
	if !ok {
		// Fallback: Default High Price (Prevent free usage loophole)
		// e.g. use GPT-4 price
		log.Printf("[Billing] Warning: Model %s not found in price table, using default.", model)
		if def, ok := table.Models["gpt-4"]; ok {
			price = def
		} else {
			price = protocol.ModelPrice{InputPrice: 100.0, OutputPrice: 100.0} // Ultra high default
		}
	}

	// Cost = (Tokens / 1,000,000) * Price
	// Use Decimal
	
	totalCost := decimal.Zero
	million := decimal.NewFromInt(1000000)

	if usage.PromptTokens > 0 {
		tokens := decimal.NewFromInt(sanitize(usage.PromptTokens))
		p := decimal.NewFromFloat(price.InputPrice)
		// cost += (tokens / 1M) * price
		totalCost = totalCost.Add(tokens.Div(million).Mul(p))
	}
	
	if usage.CompletionTokens > 0 {
		tokens := decimal.NewFromInt(sanitize(usage.CompletionTokens))
		p := decimal.NewFromFloat(price.OutputPrice)
		totalCost = totalCost.Add(tokens.Div(million).Mul(p))
	}

	if usage.ImageCount > 0 {
		count := decimal.NewFromInt(sanitize(usage.ImageCount))
		p := decimal.NewFromFloat(price.PerRequest)
		totalCost = totalCost.Add(count.Mul(p))
	}

	// Round to 6 decimal places (micro-usd)
	res, _ := totalCost.Round(6).Float64()
	return res
}