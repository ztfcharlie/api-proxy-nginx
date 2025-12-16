package billing

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"api-proxy/go-gateway/pkg/redis"

	redisgo "github.com/redis/go-redis/v9"
)

const (
	StreamKey = "stream:api_logs"
)

// SettlementService 处理结算和日志
type SettlementService struct{}

func NewSettlementService() *SettlementService {
	return &SettlementService{}
}

// CalculateCost 根据模型和用量计算费用
func (s *SettlementService) CalculateCost(model string, metrics *UsageMetrics) float64 {
	// 简单的硬编码价格 (单位: USD)
	// TODO: 从 Redis 配置加载
	var priceInput, priceOutput float64
	
	if strings.Contains(model, "gpt-4") {
		priceInput = 30.0 / 1000000.0
		priceOutput = 60.0 / 1000000.0
	} else {
		// GPT-3.5 / Default
		priceInput = 0.5 / 1000000.0
		priceOutput = 1.5 / 1000000.0
	}
	
	cost := (float64(metrics.InputTokens) * priceInput) + (float64(metrics.OutputTokens) * priceOutput)
	
	// 图片费用
	if metrics.ImageCount > 0 {
		// 假设 $0.04 一张
		cost += float64(metrics.ImageCount) * 0.04
	}
	
	return cost
}

// RecordUsageAndCost 扣费并记录日志
func (s *SettlementService) RecordUsageAndCost(ctx context.Context, requestID string, userID interface{}, channelID int, modelName string, metrics *UsageMetrics, cost float64, status int, duration time.Duration) error {
	// 1. 扣费 (Lua Script)
	balanceKey := fmt.Sprintf("oauth2:user:balance:%v", userID)
	
	script := `
		local current = redis.call('GET', KEYS[1])
		if not current then return -1 end
		local balance = tonumber(current)
		local cost = tonumber(ARGV[1])
		
		if balance < cost then
			return -2
		end
		
		return redis.call('INCRBYFLOAT', KEYS[1], -cost)
	`
	
	_, err := redis.Client.Eval(ctx, script, []string{balanceKey}, cost).Result()
	if err != nil {
		log.Printf("[Settlement] Failed to deduct balance for user %v: %v", userID, err)
	}

	// 2. 异步日志 (Redis Stream)
	logEntry := map[string]interface{}{
		"request_id":    requestID,
		"user_id":       userID,
		"channel_id":    channelID,
		"model":         modelName,
		"input_tokens":  metrics.InputTokens,
		"output_tokens": metrics.OutputTokens,
		"total_tokens":  metrics.TotalTokens,
		"cost":          cost,
		"status":        status,
		"duration_ms":   duration.Milliseconds(),
		"timestamp":     time.Now().Unix(),
		"ip":            "0.0.0.0",
	}
	
	bytes, _ := json.Marshal(logEntry)
	
	// 使用 XADD 推送到 Stream
	// 这里的 StreamKey 需要和 go-processor 里的 log_consumer 监听的一致
	err = redis.Client.XAdd(ctx, &redisgo.XAddArgs{
		Stream: StreamKey,
		Values: map[string]interface{}{
			"data": string(bytes),
		},
	}).Err()
	
	if err != nil {
		log.Printf("[Settlement] Failed to push log to stream: %v", err)
		return err
	}
	
	return nil
}
