package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"api-proxy/go-processor/billing"

	"github.com/redis/go-redis/v9"
)

const KeyModelPrices = "oauth2:model_prices" // Kept as it might not be in main.go

// LogConsumer 负责消费 Redis Stream 并写入 MySQL
type LogConsumer struct {
	rdb    *redis.Client
	db     *sql.DB
	engine *billing.Engine
}

type LogMetadata struct {
	ClientToken          string      `json:"client_token"`
	KeyFilename          string      `json:"key_filename"` // Channel ID
	ModelName            string      `json:"model_name"`
	Status               int         `json:"status"`
	UpstreamResponseTime interface{} `json:"upstream_response_time"`
	RequestTime          interface{} `json:"request_time"`
	IP                   string      `json:"ip"`
	UserAgent            string      `json:"user_agent"`
	URI                  string      `json:"uri"`
	ContentType          string      `json:"content_type"` // [Added]
}

// Helper to safe convert interface to float64
func toFloat64(v interface{}) float64 {
	if v == nil {
		return 0
	}
	switch i := v.(type) {
	case float64:
		return i
	case string:
		var f float64
		fmt.Sscanf(i, "%f", &f)
		return f
	case int:
		return float64(i)
	default:
		return 0
	}
}

func NewLogConsumer(rdb *redis.Client, db *sql.DB) *LogConsumer {
	return &LogConsumer{
		rdb:    rdb,
		db:     db,
		engine: billing.NewEngine(),
	}
}

func (lc *LogConsumer) Start(ctx context.Context) {
	log.Println("[INFO] Log Consumer started.")

	// 确保 Consumer Group 存在
	err := lc.rdb.XGroupCreateMkStream(ctx, StreamKey, ConsumerGroup, "$").Err()
	if err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
		log.Printf("[ERROR] Failed to create consumer group: %v", err)
	}

	for {
		select {
		case <-ctx.Done():
			return
		default:
			// 阻塞读取
			streams, err := lc.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
				Group:    ConsumerGroup,
				Consumer: ConsumerName,
				Streams:  []string{StreamKey, ">"},
				Count:    20, // 批量读取 20 条
				Block:    2 * time.Second,
			}).Result()

			if err == redis.Nil {
				continue
			}
			if err != nil {
				log.Printf("[ERROR] XReadGroup error: %v", err)
				time.Sleep(1 * time.Second)
				continue
			}

			for _, stream := range streams {
				if len(stream.Messages) > 0 {
					lc.processBatch(ctx, stream.Messages)
				}
			}
		}
	}
}

// 更新渠道错误状态
func (lc *LogConsumer) updateChannelError(channelID int, errorMsg string) {
	if channelID <= 0 {
		return
	}
	if len(errorMsg) > 255 {
		errorMsg = errorMsg[:252] + "..."
	}
	
	go func() {
		_, err := lc.db.Exec("UPDATE sys_channels SET last_error = ?, updated_at = NOW() WHERE id = ?", errorMsg, channelID)
		if err != nil {
			log.Printf("[WARN] Failed to update channel error: %v", err)
		}
	}()
}

// [Added] Helper to publish debug logs to Redis
func (lc *LogConsumer) publishDebug(level, msg string) {
	if os.Getenv("ENABLE_DEBUG_STREAM") != "true" {
		return
	}
	payload := fmt.Sprintf(`{"ts":"%s", "source":"go-consumer", "level":"%s", "msg":"%s"}`, 
		time.Now().Format(time.RFC3339), level, strings.ReplaceAll(msg, "\"", "\\\""))
	
	go func() {
		lc.rdb.Publish(context.Background(), "sys:log_stream", payload)
	}()
}

func (lc *LogConsumer) processBatch(ctx context.Context, msgs []redis.XMessage) {
	log.Printf("[DEBUG] processBatch received %d messages", len(msgs))
	lc.publishDebug("info", fmt.Sprintf("Received batch of %d messages", len(msgs)))

	saveBody := os.Getenv("LOG_SAVE_BODY") == "true"

	var valueStrings []string
	var valueArgs []interface{}
	var ackIDs []string

	for _, msg := range msgs {
		values := msg.Values
		reqID, _ := values["req_id"].(string)
		metaStr, _ := values["meta"].(string)
		
		// 解析 Metadata
		var meta LogMetadata
		if err := json.Unmarshal([]byte(metaStr), &meta); err != nil {
			log.Printf("[WARN] Failed to parse metadata for req %s", reqID)
			lc.publishDebug("warn", fmt.Sprintf("Failed to parse metadata for req %s: %v", reqID, err))
			ackIDs = append(ackIDs, msg.ID)
			continue
		}

		// [Fix] Restore body extraction
		reqBodyRaw, _ := values["req_body"].(string)
		resBodyRaw, _ := values["res_body"].(string)
		
		// 处理字段
		tokenKey := ""
		if strings.HasPrefix(meta.ClientToken, "sk-") {
			tokenKey = meta.ClientToken
		}
		
		channelID := 0
		fmt.Sscanf(meta.KeyFilename, "%d", &channelID)

		// [Added] Resolve User ID from Token
		userID := 0
		if tokenKey != "" {
			err := lc.db.QueryRowContext(ctx, "SELECT user_id FROM sys_virtual_tokens WHERE token_key = ?", tokenKey).Scan(&userID)
			if err != nil && err != sql.ErrNoRows {
				log.Printf("[WARN] Failed to resolve user_id for token %s: %v", tokenKey, err)
			}
		}

		// [Added] 错误状态上报
		if meta.Status >= 400 && channelID > 0 {
			var errMsg string
			if len(resBodyRaw) > 0 {
				var jsonErr struct {
					Error struct {
						Message string `json:"message"`
					} `json:"error"`
					Message string `json:"message"`
				}
				if json.Unmarshal([]byte(resBodyRaw), &jsonErr) == nil {
					if jsonErr.Error.Message != "" {
						errMsg = fmt.Sprintf("[%d] %s", meta.Status, jsonErr.Error.Message)
					} else if jsonErr.Message != "" {
						errMsg = fmt.Sprintf("[%d] %s", meta.Status, jsonErr.Message)
					}
				}
			}
			
			if errMsg == "" {
				if len(resBodyRaw) > 0 && len(resBodyRaw) < 100 {
					errMsg = fmt.Sprintf("[%d] %s", meta.Status, resBodyRaw)
				} else {
					errMsg = fmt.Sprintf("HTTP %d Error", meta.Status)
				}
			}
			
			lc.updateChannelError(channelID, errMsg)
		}

		// [Modified] 使用计费引擎计算 Token 和费用
		// Added 'meta.ContentType' to arguments
		usage, err := lc.engine.Calculate(meta.ModelName, meta.URI, []byte(reqBodyRaw), []byte(resBodyRaw), meta.ContentType, meta.Status)
		if err != nil {
			log.Printf("[WARN] Billing calculation failed for %s: %v", reqID, err)
		}

		if meta.Status == 200 {
			cost, err := lc.calculateCost(ctx, channelID, meta.ModelName, usage)
			if err == nil {
				usage.Cost = cost
			} else {
				if err != redis.Nil {
					log.Printf("[WARN] Cost calculation failed for %s: %v", reqID, err)
				}
			}
			
			// [Added] Async Task Handling
			cfg, found := lc.getModelConfig(ctx, channelID, meta.ModelName)
			if found && cfg.IsAsync {
				var provider string
				lc.db.QueryRowContext(ctx, "SELECT `type` FROM sys_channels WHERE id = ?", channelID).Scan(&provider)
				
				taskID := extractUpstreamTaskID(provider, resBodyRaw)
				if taskID != "" {
					_, err := lc.db.ExecContext(ctx, 
						"INSERT INTO sys_async_tasks (request_id, user_id, channel_id, provider, upstream_task_id, pre_cost, response_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
						reqID, userID, channelID, provider, taskID, usage.Cost, resBodyRaw)
						
					if err != nil {
						log.Printf("[WARN] Failed to save async task: %v", err)
					} else {
						lc.rdb.Set(ctx, fmt.Sprintf("oauth2:task_route:%s", taskID), channelID, 24*time.Hour)
						lc.publishDebug("info", fmt.Sprintf("Async Task Created: %s (%s)", taskID, provider))
					}
				}
			}
		}

		// [Added] Real-time Log Stream (Frontend Debugging)
		if os.Getenv("ENABLE_DEBUG_STREAM") == "true" {
			go func(m LogMetadata, u billing.Usage, rid string, cid int) {
				payload := fmt.Sprintf(`{"ts":"%s", "source":"go-billing", "level":"info", "msg":"Processed Request: %s (Status: %d, Model: %s, Cost: %.6f, Tokens: %d)", "meta": {"req_id": "%s", "channel_id": %d}}`,
					time.Now().Format(time.RFC3339),
					rid,
					m.Status,
					m.ModelName,
					u.Cost,
					u.TotalTokens,
					rid,
					cid,
				)
				lc.rdb.Publish(context.Background(), "sys:log_stream", payload)
			}(meta, usage, reqID, channelID)
		}

		var reqBody, resBody string
		
		if saveBody {
			reqBody = limitString(reqBodyRaw, 2000)
		} else {
			reqBody = "" 
		}

		if saveBody || meta.Status != 200 {
			resBody = limitString(resBodyRaw, 2000)
		} else {
			resBody = ""
		}
		
		// [Fix] Safe type conversion
		reqTime := toFloat64(meta.RequestTime)
		upTime := toFloat64(meta.UpstreamResponseTime)
		
		durationMs := int(reqTime * 1000)
		upstreamDurationMs := int(upTime * 1000)

		// 构建 SQL 值
		valueStrings = append(valueStrings, "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
		valueArgs = append(valueArgs, 
			reqID, 
			userID, // [Fix] Use resolved user_id
			channelID,
			tokenKey,
			meta.ModelName,
			meta.URI,       // request_uri
			meta.Status,
			durationMs,
			upstreamDurationMs,
			usage.PromptTokens,
			usage.CompletionTokens,
			usage.TotalTokens,
			usage.Cost,
			meta.IP,
			meta.UserAgent, 
			reqBody,
			resBody,
			time.Now(),
		)

		ackIDs = append(ackIDs, msg.ID)
	}

	if len(valueStrings) > 0 {
		stmt := fmt.Sprintf("INSERT INTO sys_request_logs (request_id, user_id, channel_id, token_key, model, request_uri, status_code, duration_ms, upstream_duration_ms, prompt_tokens, completion_tokens, total_tokens, cost, ip, user_agent, req_body, res_body, created_at) VALUES %s", strings.Join(valueStrings, ","))
		
		_, err := lc.db.ExecContext(ctx, stmt, valueArgs...)
		if err != nil {
			log.Printf("[ERROR] Batch insert failed: %v", err)
			lc.publishDebug("error", fmt.Sprintf("DB Insert Failed: %v", err))
		} else {
			lc.rdb.XAck(ctx, StreamKey, ConsumerGroup, ackIDs...)
			msg := fmt.Sprintf("Successfully saved %d logs to DB", len(valueStrings))
			log.Println("[INFO] " + msg)
			lc.publishDebug("info", msg)
		}
	} else if len(ackIDs) > 0 {
		lc.rdb.XAck(ctx, StreamKey, ConsumerGroup, ackIDs...)
		lc.publishDebug("warn", "Batch contained only invalid data, skipped.")
	}
}

// ChannelConfigRedis 定义 Redis 中存储的 Channel 结构 (部分)
type ChannelConfigRedis struct {
	ModelsConfig map[string]ModelBillingConfig `json:"models_config"`
}

type ModelBillingConfig struct {
	Mode        string  `json:"mode"` 
	InputPrice  float64 `json:"input"`
	OutputPrice float64 `json:"output"`
	Price       float64 `json:"price"`
	IsAsync     bool    `json:"is_async"` // [Added] Async Task Flag
}

// [Refactor] 获取模型配置 (全局 + 渠道覆盖)
func (lc *LogConsumer) getModelConfig(ctx context.Context, channelID int, model string) (ModelBillingConfig, bool) {
	var globalCfg ModelBillingConfig
	var globalFound bool
	
	val, err := lc.rdb.Get(ctx, KeyModelPrices).Result()
	if err == nil {
		var globalPrices map[string]ModelBillingConfig
		if err := json.Unmarshal([]byte(val), &globalPrices); err == nil {
			if c, ok := globalPrices[model]; ok {
				globalCfg = c
				globalFound = true
			}
		}
	}

	if !globalFound {
		return ModelBillingConfig{}, false
	}

	finalCfg := globalCfg
	
	if channelID > 0 {
		key := fmt.Sprintf("oauth2:channel:%d", channelID)
		val, err := lc.rdb.Get(ctx, key).Result()
		
		var chConfig ChannelConfigRedis
		
		if err == nil {
			json.Unmarshal([]byte(val), &chConfig)
		} else if err == redis.Nil {
			var modelsConfigStr string
			if lc.db.QueryRowContext(ctx, "SELECT models_config FROM sys_channels WHERE id = ?", channelID).Scan(&modelsConfigStr) == nil && modelsConfigStr != "" {
				json.Unmarshal([]byte(modelsConfigStr), &chConfig.ModelsConfig)
			}
		}

		if chConfig.ModelsConfig != nil {
			if c, ok := chConfig.ModelsConfig[model]; ok {
				if c.Mode != "" { finalCfg.Mode = c.Mode }
			} else if c, ok := chConfig.ModelsConfig["default"]; ok {
				if c.Mode != "" { finalCfg.Mode = c.Mode }
			}
		}
	}
	
	if finalCfg.Mode == "" { finalCfg.Mode = "token" }
	
	return finalCfg, true
}

func (lc *LogConsumer) calculateCost(ctx context.Context, channelID int, model string, u billing.Usage) (float64, error) {
	cfg, found := lc.getModelConfig(ctx, channelID, model)
	if !found {
		return 0, nil
	}

	var cost float64
	const PriceUnitDivisor = 1000000.0 

	if cfg.Mode == "request" {
		cost = cfg.Price
	} else if cfg.Mode == "time" {
		cost = u.AudioSeconds * cfg.Price
	} else {
		inputCost := (float64(u.PromptTokens) / PriceUnitDivisor) * cfg.InputPrice
		outputCost := (float64(u.CompletionTokens) / PriceUnitDivisor) * cfg.OutputPrice
		cost = inputCost + outputCost
		
		if u.Images > 0 && cfg.Price > 0 {
			cost += float64(u.Images) * cfg.Price
		}
	}

	return cost, nil
}

func limitString(s string, n int) string {
	if len(s) > n {
		return s[:n] + "...(truncated)"
	}
	return s
}

// Helper to extract task ID from different providers
func extractUpstreamTaskID(provider, jsonBody string) string {
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(jsonBody), &data); err != nil {
		return ""
	}
	
	if v, ok := data["id"].(string); ok { return v }
	if v, ok := data["task_id"].(string); ok { return v }
	if v, ok := data["uuid"].(string); ok { return v }
	
	return ""
}