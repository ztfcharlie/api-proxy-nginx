package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/redis/go-redis/v9"
)

// DBChannel 对应数据库表 channels
type DBChannel struct {
	ID           int    `json:"id"`
	Type         string `json:"type"`
	Key          string `json:"key"` // 注意：数据库列名可能是 key_json 或 secret
	State        int    `json:"state"`
	ModelsConfig string `json:"models_config"` // JSON string in DB
}

// DBToken 对应数据库表 tokens
type DBToken struct {
	Token string `json:"token"` // user vtoken
	Key   string `json:"key"`   // real api key or channel binding
}

type SyncManager struct {
	rdb *redis.Client
	db  *sql.DB
}

func NewSyncManager(rdb *redis.Client, dbDSN string) (*SyncManager, error) {
	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		return nil, err
	}
	// 测试连接
	if err := db.Ping(); err != nil {
		return nil, err
	}
	
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)

	return &SyncManager{
		rdb: rdb,
		db:  db,
	}, nil
}

// OpenNewDB 辅助方法：创建新的数据库连接 (供 LogConsumer 使用)
func (sm *SyncManager) OpenNewDB(dsn string) (*sql.DB, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	// 独立的连接池配置
	db.SetMaxOpenConns(20) 
	db.SetMaxIdleConns(5)
	return db, nil
}

// Start 启动同步任务
func (sm *SyncManager) Start(ctx context.Context) {
	log.Println("[INFO] Sync Manager (Reconciliation) started.")

	// 立即运行一次
	sm.performSync(ctx)

	// 启动高频看门狗
	go sm.startWatchdog(ctx)

	// 每 5 分钟执行一次全量对账
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			sm.db.Close()
			return
		case <-ticker.C:
			sm.performSync(ctx)
		}
	}
}

// [Added] startWatchdog 高频监控关键缓存
func (sm *SyncManager) startWatchdog(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	
	log.Println("[INFO] Watchdog started (5s interval)")

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// 检查关键 Key: oauth2:model_prices
			exists, err := sm.rdb.Exists(ctx, "oauth2:model_prices").Result()
			if err != nil {
				log.Printf("[WARN] Watchdog Redis check failed: %v", err)
				continue
			}
			
			if exists == 0 {
				log.Println("[WARN] Watchdog Alert: Critical cache 'oauth2:model_prices' missing! Triggering sync...")
				sm.performSync(ctx)
				// 冷却 10 秒，防止并发重复触发
				time.Sleep(10 * time.Second)
			}
		}
	}
}

// ReportJobStatus 汇报任务状态到 Redis
func (sm *SyncManager) ReportJobStatus(ctx context.Context, status, lastResult string) {
	now := time.Now()
	jobData := map[string]interface{}{
		"name":        "db_sync_job",
		"description": "Sync MySQL channels/tokens to Redis (Go Service)",
		"interval":    300000, // 5m
		"lastRun":     now,
		"nextRun":     now.Add(5 * time.Minute),
		"lastResult":  lastResult,
		"status":      status, // running, idle, failed
		"updated_at":  now.Unix(),
	}
	
	val, _ := json.Marshal(jobData)
	sm.rdb.Set(ctx, "oauth2:sys:job:db_sync", string(val), 0)
}

// performSync 执行实际同步
func (sm *SyncManager) performSync(ctx context.Context) {
	sm.ReportJobStatus(ctx, "running", "Syncing DB to Redis...")
	
	start := time.Now()
	
	var errs []string

	if err := sm.syncChannels(ctx); err != nil {
		errMsg := fmt.Sprintf("Sync channels failed: %v", err)
		log.Printf("[ERROR] %s", errMsg)
		errs = append(errs, errMsg)
	}

	// [Added] Sync Models
	if err := sm.syncModels(ctx); err != nil {
		errMsg := fmt.Sprintf("Sync models failed: %v", err)
		log.Printf("[ERROR] %s", errMsg)
		errs = append(errs, errMsg)
	}

	if err := sm.syncUserTokens(ctx); err != nil {
		errMsg := fmt.Sprintf("Sync user tokens failed: %v", err)
		log.Printf("[ERROR] %s", errMsg)
		errs = append(errs, errMsg)
	}

	duration := time.Since(start)
	
	if len(errs) > 0 {
		sm.ReportJobStatus(ctx, "failed", strings.Join(errs, "; "))
	} else {
		sm.ReportJobStatus(ctx, "idle", fmt.Sprintf("Success (%v)", duration))
	}

	log.Printf("[INFO] Full sync completed in %v", duration)
}

// ForceRun 手动触发同步 (供 Pub/Sub 调用)
func (sm *SyncManager) ForceRun() {
	log.Println("[INFO] Force running DB Sync Job...")
	go sm.performSync(context.Background())
}

// [Added] syncModels 同步模型价格 (DB -> Redis)
func (sm *SyncManager) syncModels(ctx context.Context) error {
	// 1. 查询所有启用模型
	rows, err := sm.db.Query("SELECT name, price_input, price_output, price_request, price_time FROM sys_models WHERE status = 1")
	if err != nil {
		return err
	}
	defer rows.Close()

	priceMap := make(map[string]interface{})

	for rows.Next() {
		var name string
		var pInput, pOutput, pRequest, pTime sql.NullFloat64
		
		if err := rows.Scan(&name, &pInput, &pOutput, &pRequest, &pTime); err != nil {
			log.Printf("[WARN] Scan model failed: %v", err)
			continue
		}

		// 逻辑与 Node.js 保持一致
		mode := "token"
		var price float64 = 0

		if pRequest.Valid && pRequest.Float64 > 0 {
			mode = "request"
			price = pRequest.Float64
		} else if pTime.Valid && pTime.Float64 > 0 {
			mode = "time"
			price = pTime.Float64
		}
		
		if price > 0 {
			log.Printf("[SyncModel DEBUG] Model: %s, Mode: %s, ReqPrice: %f, TimePrice: %f, Final: %f", name, mode, pRequest.Float64, pTime.Float64, price)
		}

		priceMap[name] = map[string]interface{}{
			"mode":   mode,
			"input":  pInput.Float64,  // Default 0 if null
			"output": pOutput.Float64, // Default 0 if null
			"price":  price,
		}
	}

	// 2. 写入 Redis
	valBytes, _ := json.Marshal(priceMap)
	if err := sm.rdb.Set(ctx, "oauth2:model_prices", string(valBytes), 0).Err(); err != nil {
		return err
	}
	
	log.Printf("[INFO] Synced %d models prices to Redis", len(priceMap))
	return nil
}

// syncChannels 同步渠道配置 (DB -> Redis)
func (sm *SyncManager) syncChannels(ctx context.Context) error {
	// 1. 从 DB 读取所有有效渠道
	// 假设表名为 sys_channels，列名根据实际情况调整
	rows, err := sm.db.Query("SELECT id, type, `credentials`, status, models_config FROM sys_channels WHERE status = 1")
	if err != nil {
		return err
	}
	defer rows.Close()

	activeChannelIDs := make(map[int]bool)

	for rows.Next() {
		var ch DBChannel
		var modelsConfigStr sql.NullString // 临时接收，处理 NULL
		// DBChannel struct definition in previous file was: Key string `json:"key"` which corresponds to credentials
		if err := rows.Scan(&ch.ID, &ch.Type, &ch.Key, &ch.State, &modelsConfigStr); err != nil {
			log.Printf("[WARN] Scan channel failed: %v", err)
			continue
		}
		activeChannelIDs[ch.ID] = true

		// 构造 Redis Value
		redisVal := map[string]interface{}{
			"id":    ch.ID,
			"type":  ch.Type,
			"key":   ch.Key,
			"state": ch.State,
		}
		
		if modelsConfigStr.Valid && modelsConfigStr.String != "" {
			var mc interface{}
			if err := json.Unmarshal([]byte(modelsConfigStr.String), &mc); err == nil {
				redisVal["models_config"] = mc
			}
		}

		valBytes, _ := json.Marshal(redisVal)
		
		// 写入 Redis
		redisKey := fmt.Sprintf("%s%d", KeyPrefixChannel, ch.ID)
		if err := sm.rdb.Set(ctx, redisKey, string(valBytes), 0).Err(); err != nil {
			log.Printf("[WARN] Failed to set channel %d: %v", ch.ID, err)
		}
	}

	// 2. 清理孤儿 Key (Orphan Cleanup)
	// 找出 Redis 里所有 channel:*，如果不在 activeChannelIDs 里，就删掉
	iter := sm.rdb.Scan(ctx, 0, KeyPrefixChannel+"*", 0).Iterator()
	deletedCount := 0
	for iter.Next(ctx) {
		key := iter.Val()
		// 解析 ID: oauth2:channel:123
		parts := strings.Split(key, ":")
		if len(parts) < 3 {
			continue
		}
		
		var id int
		if _, err := fmt.Sscanf(parts[2], "%d", &id); err == nil {
			if !activeChannelIDs[id] {
				sm.rdb.Del(ctx, key)
				deletedCount++
			}
		}
	}
	if deletedCount > 0 {
		log.Printf("[INFO] Cleaned up %d orphan channels", deletedCount)
	}

	return nil
}

// syncUserTokens 同步用户 Token (DB -> Redis)
// 这里对应 Node.js 中的 tokens 表同步
func (sm *SyncManager) syncUserTokens(ctx context.Context) error {
	// TODO: 根据实际表结构调整
	// 假设表名为 tokens (user virtual tokens)
	// 逻辑类似 syncChannels
	return nil 
}