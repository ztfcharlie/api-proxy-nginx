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
	UpstreamResponseTime interface{} `json:"upstream_response_time"` // Handle string or float
	RequestTime          interface{} `json:"request_time"`           // Handle string or float
	IP                   string      `json:"ip"`
	UserAgent            string      `json:"user_agent"`
	URI                  string      `json:"uri"` // Request URI from Lua
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
	// 截断错误信息防止过长
	if len(errorMsg) > 255 {
		errorMsg = errorMsg[:252] + "..."
	}
	
	// 异步执行更新，不阻塞主流程
	go func() {
		// 这里可以加一个简单的缓存去重，防止短时间内重复更新同一个错误
		// 但为了实时性，直接更新 DB
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
	
	// Non-blocking publish
	go func() {
		lc.rdb.Publish(context.Background(), "sys:log_stream", payload)
	}()
}

func (lc *LogConsumer) processBatch(ctx context.Context, msgs []redis.XMessage) {
	log.Printf("[DEBUG] processBatch received %d messages", len(msgs))
	lc.publishDebug("info", fmt.Sprintf("Received batch of %d messages", len(msgs)))

	// ... (existing variable declarations) ...
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

		// [Added] 错误状态上报
		if meta.Status >= 400 && channelID > 0 {
			var errMsg string
			// 尝试从响应体解析错误
			if len(resBodyRaw) > 0 {
				// 尝试解析常见 JSON 错误格式
				var jsonErr struct {
					Error struct {
						Message string `json:"message"`
					} `json:"error"`
					Message string `json:"message"` // some APIs return flat message
				}
				if json.Unmarshal([]byte(resBodyRaw), &jsonErr) == nil {
					if jsonErr.Error.Message != "" {
						errMsg = fmt.Sprintf("[%d] %s", meta.Status, jsonErr.Error.Message)
					} else if jsonErr.Message != "" {
						errMsg = fmt.Sprintf("[%d] %s", meta.Status, jsonErr.Message)
					}
				}
			}
			
			// 如果没解析出来，用原始 body 或状态码
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
		usage, err := lc.engine.Calculate(meta.ModelName, meta.URI, []byte(reqBodyRaw), []byte(resBodyRaw), meta.Status)
		if err != nil {
			log.Printf("[WARN] Billing calculation failed for %s: %v", reqID, err)
		}

		// ... (existing billing logic)
		if meta.Status == 200 {
			cost, err := lc.calculateCost(ctx, channelID, meta.ModelName, usage)
			if err == nil {
				usage.Cost = cost
			} else {
				if err != redis.Nil {
					log.Printf("[WARN] Cost calculation failed for %s: %v", reqID, err)
				}
			}
			
			// ... (existing error clearing logic)
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

		// 隐私处理：决定入库的内容
		var reqBody, resBody string
		
		// 1. Request Body: 严格遵守隐私开关
		if saveBody {
			reqBody = limitString(reqBodyRaw, 2000)
		} else {
			reqBody = "" 
		}

		// 2. Response Body: 成功时遵守开关，失败时(非200)强制记录以便排查
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

		// [Fix] Resolve User ID from Token
		userID := 0
		if tokenKey != "" {
			// Simple DB lookup (for production, adding a cache here would be better)
			err := lc.db.QueryRowContext(ctx, "SELECT user_id FROM sys_virtual_tokens WHERE token_key = ?", tokenKey).Scan(&userID)
			if err != nil && err != sql.ErrNoRows {
				log.Printf("[WARN] Failed to resolve user_id for token %s: %v", tokenKey, err)
			}
		}

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
			// 插入失败暂不 ACK
		} else {
			// 成功，批量 ACK
			lc.rdb.XAck(ctx, StreamKey, ConsumerGroup, ackIDs...)
			msg := fmt.Sprintf("Successfully saved %d logs to DB", len(valueStrings))
			log.Println("[INFO] " + msg)
			lc.publishDebug("info", msg)
		}
	} else if len(ackIDs) > 0 {
		// 全是无效数据，直接 ACK
		lc.rdb.XAck(ctx, StreamKey, ConsumerGroup, ackIDs...)
		lc.publishDebug("warn", "Batch contained only invalid data, skipped.")
	}
}

func limitString(s string, n int) string {
	if len(s) > n {
		return s[:n] + "...(truncated)"
	}
	return s
}

// ChannelConfigRedis 定义 Redis 中存储的 Channel 结构 (部分)
type ChannelConfigRedis struct {
	ModelsConfig map[string]ModelBillingConfig `json:"models_config"`
}

// ModelBillingConfig 定义具体的计费规则
// 假设结构: { "mode": "token", "input": 0.0001, "output": 0.0002 } 或 { "mode": "request", "price": 0.01 }
type ModelBillingConfig struct {
	Mode        string  `json:"mode"` // "token" or "request"
	InputPrice  float64 `json:"input"`  // per 1k tokens
	OutputPrice float64 `json:"output"`
	Price       float64 `json:"price"`  // per request
}

// ... (ChannelConfigRedis struct) ...

// 全局模型价格缓存 Key
const KeyModelPrices = "oauth2:model_prices"

func (lc *LogConsumer) calculateCost(ctx context.Context, channelID int, model string, u billing.Usage) (float64, error) {
	// 1. 获取全局价格 (基准)
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
		// 如果全局都没定义这个模型的价格，那就真的没法算钱了
		// (或者默认免费)
		return 0, nil
	}

	// 2. 获取渠道特定的计费模式
	// 默认继承全局配置的模式 (通常是 token)
	billingMode := globalCfg.Mode 
	if billingMode == "" {
		billingMode = "token" 
	}
	
	// 检查渠道是否有特殊配置 (比如强制按次计费)
	if channelID > 0 {
		key := fmt.Sprintf("oauth2:channel:%d", channelID)
		val, err := lc.rdb.Get(ctx, key).Result()
		
		var chConfig ChannelConfigRedis
		// var loadedFromDB bool // Unused
		
		if err == nil {
			json.Unmarshal([]byte(val), &chConfig)
		} else if err == redis.Nil {
			// 降级查库
			var modelsConfigStr string
			if lc.db.QueryRowContext(ctx, "SELECT models_config FROM sys_channels WHERE id = ?", channelID).Scan(&modelsConfigStr) == nil && modelsConfigStr != "" {
				json.Unmarshal([]byte(modelsConfigStr), &chConfig.ModelsConfig)
				// loadedFromDB = true
			}
		}

		if chConfig.ModelsConfig != nil {
			if c, ok := chConfig.ModelsConfig[model]; ok {
				if c.Mode != "" {
					billingMode = c.Mode
				}
				// 如果渠道覆盖了价格 (例如按次计费的特殊价格)，也可以在这里读取
				// 但根据您的描述，渠道通常不设折扣，只设模式
				// 如果有特殊需求，可以：if c.Price > 0 { globalCfg.Price = c.Price }
			} else if c, ok := chConfig.ModelsConfig["default"]; ok {
				if c.Mode != "" {
					billingMode = c.Mode
				}
			}
		}
	}

	// 3. 计算最终费用
	var cost float64
	// [Modified] 将计费单位统一为 1M (百万) Token
	const PriceUnitDivisor = 1000000.0 

	if billingMode == "request" {
		// 按次计费: 优先用全局定义的单次价格
		cost = globalCfg.Price
	} else {
		// 按量计费: 使用全局定义的 Input/Output 价格
		inputCost := (float64(u.PromptTokens) / PriceUnitDivisor) * globalCfg.InputPrice
		outputCost := (float64(u.CompletionTokens) / PriceUnitDivisor) * globalCfg.OutputPrice
		cost = inputCost + outputCost
		
		// 图片/视频特殊处理
		if u.Images > 0 && globalCfg.Price > 0 {
			cost += float64(u.Images) * globalCfg.Price
		}
	}

	return cost, nil
}
