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
	Method               string      `json:"method"`       // [Added]
	Status               int         `json:"status"`
	UpstreamResponseTime interface{} `json:"upstream_response_time"`
	RequestTime          interface{} `json:"request_time"`
	IP                   string      `json:"ip"`
	UserAgent            string      `json:"user_agent"`
	URI                  string      `json:"uri"`
	ContentType          string      `json:"content_type"`
	InternalPoll         string      `json:"internal_poll"`
	IsPoll               bool        `json:"is_poll"` 
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

// [Added] 清除渠道错误状态
func (lc *LogConsumer) clearChannelError(channelID int) {
	if channelID <= 0 {
		return
	}
	go func() {
		// 只有当 last_error 不为空时才更新，减少 DB 压力 (需要查一次？不用，直接 Update 影响行数即可，或者无脑 Update)
		// 为了性能，直接无脑 Update NULL
		_, err := lc.db.Exec("UPDATE sys_channels SET last_error = NULL WHERE id = ? AND last_error IS NOT NULL", channelID)
		if err != nil {
			log.Printf("[WARN] Failed to clear channel error: %v", err)
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
			// [Fix] Clear error on success
			if channelID > 0 {
				lc.clearChannelError(channelID)
			}

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
						"INSERT INTO sys_async_tasks (request_id, user_id, channel_id, token_key, provider, upstream_task_id, pre_cost, response_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
						reqID, userID, channelID, tokenKey, provider, taskID, usage.Cost, resBodyRaw)
						
					if err != nil {
						log.Printf("[WARN] Failed to save async task: %v", err)
					} else {
						lc.rdb.Set(ctx, fmt.Sprintf("oauth2:task_route:%s", taskID), channelID, 24*time.Hour)
						lc.publishDebug("info", fmt.Sprintf("Async Task Created: %s (%s)", taskID, provider))
					}
				}
			}
		}

				                                // [Logic] Handle Async Task Polling Results
				                                // If this is a polling request (identified by Nginx), we process the result but DO NOT log it to DB.
				                                if meta.IsPoll && meta.Status == 200 {
				                                    taskStatus, taskUpstreamID, _ := lc.engine.CheckTaskStatus(meta.ModelName, []byte(resBodyRaw))
				                                    if taskStatus != "" && taskUpstreamID != "" {				                        // Update Async Task Table ATOMICALLY
				                        res, err := lc.db.ExecContext(ctx, 
				                            "UPDATE sys_async_tasks SET status = ?, response_json = ?, updated_at = NOW() WHERE upstream_task_id = ? AND status IN ('PENDING', 'PROCESSING')", 
				                            taskStatus, limitString(resBodyRaw, 2000), taskUpstreamID)
				                            
				                        if err != nil {
				                            log.Printf("[WARN] Failed to update task status for %s: %v", taskUpstreamID, err)
				                        } else {
				                            rowsAffected, _ := res.RowsAffected()
				                            if rowsAffected > 0 && taskStatus == "FAILED" {
				                                lc.processRefund(ctx, taskUpstreamID)
				                            }
				                        }
				                    }
				                }
				                
				                // [Optimization] Do not log polling requests to DB (Internal or recognized poll)
				                // If this is a polling request, or an internal poll, skip logging.
				                if meta.InternalPoll == "true" || (isPoll && usage.Cost == 0) {
				                    ackIDs = append(ackIDs, msg.ID)
				                    continue
				                }
				        
				                // [Added] Real-time Log Stream (Frontend Debugging)		if os.Getenv("ENABLE_DEBUG_STREAM") == "true" {			go func(m LogMetadata, u billing.Usage, rid string, cid int) {
				payload := fmt.Sprintf(`{"ts":"%s", "source":"go-billing", "level":"info", "msg":"Processed Request: %s (Status: %d, Model: %s, Cost: %.6f, Tokens: %d, Images: %d)", "meta": {"req_id": "%s", "channel_id": %d}}`,
					time.Now().Format(time.RFC3339),
					rid,
					m.Status,
					m.ModelName,
					u.Cost,
					u.TotalTokens,
					u.Images, // [Added] Debug Images
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

		// [Fix] Prevent binary data (TTS/Audio/Image) from breaking MySQL Insert
		isBinaryModel := strings.Contains(meta.ModelName, "tts") || 
			strings.Contains(meta.ModelName, "whisper") || 
			strings.Contains(meta.ModelName, "dall-e") ||
			strings.Contains(meta.ModelName, "sora") ||
			strings.Contains(meta.ModelName, "video")

		if saveBody || meta.Status != 200 {
			if isBinaryModel && meta.Status == 200 {
				resBody = fmt.Sprintf("[Binary Data] %d bytes", len(resBodyRaw))
			} else {
				resBody = limitString(resBodyRaw, 2000)
			}
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

func (lc *LogConsumer) processRefund(ctx context.Context, upstreamTaskID string) {
	var preCost float64
	var userID, channelID int
	var reqID, tokenKey string
	
	err := lc.db.QueryRowContext(ctx, 
		"SELECT pre_cost, user_id, channel_id, request_id, token_key FROM sys_async_tasks WHERE upstream_task_id = ?", 
		upstreamTaskID).Scan(&preCost, &userID, &channelID, &reqID, &tokenKey)
		
	if err != nil {
		log.Printf("[Refund] Failed to find task %s: %v", upstreamTaskID, err)
		return
	}
	
	if preCost > 0 {
		log.Printf("[Refund] Processing refund of %.6f for task %s (ReqID: %s)", preCost, upstreamTaskID, reqID)
		
		// Fetch original model to ensure correct reporting
		var originalModel string
		if err := lc.db.QueryRowContext(ctx, "SELECT model FROM sys_request_logs WHERE request_id = ?", reqID).Scan(&originalModel); err != nil {
			originalModel = "unknown-refund"
		}

		// Plan A: Negative Record (Red Flush)
		refundReqID := "REFUND-" + reqID
		refundReason := "Refund for task: " + upstreamTaskID
		
		_, err := lc.db.ExecContext(ctx, `
			INSERT INTO sys_request_logs 
			(request_id, user_id, channel_id, token_key, model, request_uri, status_code, duration_ms, cost, ip, user_agent, req_body, res_body, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
		`, refundReqID, userID, channelID, tokenKey, originalModel, "/sys/refund", 200, 0, -preCost, "127.0.0.1", "GoLogConsumer", refundReason, "Task Failed Refund")

		if err != nil {
			log.Printf("[Refund] Insert failed: %v", err)
		}
	}
}

// ChannelConfigRedis 定义 Redis 中存储的 Channel 结构 (部分)
type ChannelConfigRedis struct {
	ModelsConfig map[string]ModelBillingConfig `json:"models_config"`
}

type ModelBillingConfig struct {
	Mode         string  `json:"mode"` 
	InputPrice   float64 `json:"input"`
	OutputPrice  float64 `json:"output"`
	RequestPrice float64 `json:"request"` // [Added]
	TimePrice    float64 `json:"time"`    // [Added]
	CachePrice   float64 `json:"cache"`   // [Added]
	IsAsync      bool    `json:"is_async"`
}

// [Refactor] 获取模型配置 (全局 + 渠道覆盖)
func (lc *LogConsumer) getModelConfig(ctx context.Context, channelID int, model string) (ModelBillingConfig, bool) {
	var finalCfg ModelBillingConfig
	var globalFound bool
	
	val, err := lc.rdb.Get(ctx, KeyModelPrices).Result()
	if err == nil {
		var globalPrices map[string]ModelBillingConfig
		if err := json.Unmarshal([]byte(val), &globalPrices); err == nil {
			if c, ok := globalPrices[model]; ok {
				finalCfg = c
				globalFound = true
			}
		}
	}

	if !globalFound {
		// 如果全局没配，可能直接返回 false，或者允许 0 价格
		// 暂时返回 false
		return ModelBillingConfig{}, false
	}

	// 覆盖 Channel 配置 (主要是 Mode)
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
			// Specific model config
			if c, ok := chConfig.ModelsConfig[model]; ok {
				if c.Mode != "" { finalCfg.Mode = c.Mode }
			} else if c, ok := chConfig.ModelsConfig["default"]; ok {
				// Default channel config
				if c.Mode != "" { finalCfg.Mode = c.Mode }
			}
		}
	}
	
	// Default Mode inference if not set by channel
	if finalCfg.Mode == "" { 
		// Heuristic: If only RequestPrice is set, default to request?
		// No, keep it simple. Default to token.
		finalCfg.Mode = "token" 
	}
	
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
		count := float64(u.Images)
		if count <= 0 { count = 1.0 }
		cost = count * cfg.RequestPrice
	} else if cfg.Mode == "time" {
		// Support both Audio and Video duration
		cost = (u.AudioSeconds + u.VideoSeconds) * cfg.TimePrice
	} else {
		// Token Mode
		inputCost := (float64(u.PromptTokens) / PriceUnitDivisor) * cfg.InputPrice
		outputCost := (float64(u.CompletionTokens) / PriceUnitDivisor) * cfg.OutputPrice
		// [Added] Cache Hit Cost
		cacheCost := (float64(u.CacheReadTokens) / PriceUnitDivisor) * cfg.CachePrice
		
		cost = inputCost + outputCost + cacheCost
		
		if u.Images > 0 && cfg.RequestPrice > 0 {
			cost += float64(u.Images) * cfg.RequestPrice
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
	
	// Priority list of keys to check
	keys := []string{"id", "task_id", "taskId", "uuid", "generation_id", "result"}
	
	for _, key := range keys {
		if v, ok := data[key].(string); ok && v != "" {
			return v
		}
	}
	
	return ""
}