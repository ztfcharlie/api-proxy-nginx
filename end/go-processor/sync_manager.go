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

// Start 启动同步任务
func (sm *SyncManager) Start(ctx context.Context) {
	log.Println("[INFO] Sync Manager (Reconciliation) started.")

	// 立即运行一次
	sm.performSync(ctx)

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
	sm.rdb.Set(ctx, "sys:job:db_sync", string(val), 0)
}

func (sm *SyncManager) performSync(ctx context.Context) {
	sm.ReportJobStatus(ctx, "running", "Syncing DB to Redis...")
	
	start := time.Now()
	// ...
}

// ForceRun 手动触发同步 (供 Pub/Sub 调用)
func (sm *SyncManager) ForceRun() {
	log.Println("[INFO] Force running DB Sync Job...")
	go sm.performSync(context.Background())
}

// syncChannels 同步渠道配置 (DB -> Redis)
func (sm *SyncManager) syncChannels(ctx context.Context) error {

	var errs []string

	if err := sm.syncChannels(ctx); err != nil {
		errMsg := fmt.Sprintf("Sync channels failed: %v", err)
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

// syncChannels 同步渠道配置 (DB -> Redis)
func (sm *SyncManager) syncChannels(ctx context.Context) error {
	// 1. 从 DB 读取所有有效渠道
	// 假设表名为 channels，列名根据实际情况调整
	rows, err := sm.db.Query("SELECT id, type, `key`, state, models_config FROM channels WHERE state = 1")
	if err != nil {
		return err
	}
	defer rows.Close()

	activeChannelIDs := make(map[int]bool)

	for rows.Next() {
		var ch DBChannel
		var modelsConfigStr string // 临时接收
		if err := rows.Scan(&ch.ID, &ch.Type, &ch.Key, &ch.State, &modelsConfigStr); err != nil {
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
		
		if modelsConfigStr != "" {
			var mc interface{}
			if err := json.Unmarshal([]byte(modelsConfigStr), &mc); err == nil {
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