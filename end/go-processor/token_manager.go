package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	KeyPrefixChannel   = "oauth2:channel:"
	KeyPrefixRealToken = "oauth2:real_token:"
	TokenExpireMargin  = 300 * time.Second // 提前 5 分钟刷新
)

// ChannelConfig 对应 Redis 中的 channel 结构
type ChannelConfig struct {
	ID           int                    `json:"id"`
	Type         string                 `json:"type"` // vertex, openai, etc.
	Key          string                 `json:"key"`  // Service Account JSON
	ModelsConfig map[string]interface{} `json:"models_config"`
	State        int                    `json:"state"` // 1=启用
}

// TokenData 对应 Redis 中存储的 real_token 结构
type TokenData struct {
	AccessToken string `json:"access_token"`
	ExpiresAt   int64  `json:"expires_at"` // Unix Timestamp
}

// TokenManager 管理器结构
type TokenManager struct {
	rdb *redis.Client
}

// NewTokenManager 创建管理器
func NewTokenManager(rdb *redis.Client) *TokenManager {
	return &TokenManager{rdb: rdb}
}

// Start 启动后台刷新任务
func (tm *TokenManager) Start(ctx context.Context) {
	log.Println("[INFO] Token Refresher started.")
	
	// 立即执行一次
	tm.scanAndRefresh(ctx)

	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			tm.scanAndRefresh(ctx)
		}
	}
}

// ReportJobStatus 汇报任务状态到 Redis (供 Node.js 面板读取)
func (tm *TokenManager) ReportJobStatus(ctx context.Context, status, lastResult string) {
	now := time.Now()
	jobData := map[string]interface{}{
		"name":        "token_refresh_job",
		"description": "Auto refresh Vertex/Google tokens (Go Service)",
		"interval":    10000, // 10s
		"lastRun":     now,
		"nextRun":     now.Add(10 * time.Second),
		"lastResult":  lastResult,
		"status":      status, // running, idle, failed
		"updated_at":  now.Unix(),
	}
	
	val, _ := json.Marshal(jobData)
	tm.rdb.Set(ctx, "sys:job:token_refresh", string(val), 0)
}

func (tm *TokenManager) scanAndRefresh(ctx context.Context) {
	tm.ReportJobStatus(ctx, "running", "Scanning...")

	// 1. 扫描所有 Channel Keys
	var keys []string
	iter := tm.rdb.Scan(ctx, 0, KeyPrefixChannel+"*", 0).Iterator()
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}

	if err := iter.Err(); err != nil {
		log.Printf("[ERROR] Failed to scan channels: %v", err)
		tm.ReportJobStatus(ctx, "failed", fmt.Sprintf("Redis scan error: %v", err))
		return
	}

	var wg sync.WaitGroup
	// 限制并发数为 5，防止瞬间发起太多 HTTP 请求
	sem := make(chan struct{}, 5) 
	
	var refreshCount int
	// simple mutex for counter if we want to be strict, or just atomic, or ignore race for simple logging
	var mu sync.Mutex

	for _, key := range keys {
		wg.Add(1)
		go func(k string) {
			defer wg.Done()
			sem <- struct{}{} // Acquire
			defer func() { <-sem }() // Release

			if tm.processChannel(ctx, k) {
				mu.Lock()
				refreshCount++
				mu.Unlock()
			}
		}(key)
	}
	wg.Wait()
	
	resultMsg := fmt.Sprintf("Scanned %d channels, refreshed %d", len(keys), refreshCount)
	tm.ReportJobStatus(ctx, "idle", resultMsg)
}

// ForceRun 手动触发刷新 (供 Pub/Sub 调用)
func (tm *TokenManager) ForceRun() {
	log.Println("[INFO] Force running Token Refresh Job...")
	// 使用一个新的 Context，避免被外部取消影响
	go tm.scanAndRefresh(context.Background())
}

// 返回 true 表示执行了刷新
func (tm *TokenManager) processChannel(ctx context.Context, key string) bool {
	// 获取 Channel ID
	// Key format: oauth2:channel:123
	parts := strings.Split(key, ":")
	if len(parts) < 3 {
		return false
	}
	channelID := parts[2]


	// 1. 读取 Channel 配置
	val, err := tm.rdb.Get(ctx, key).Result()
	if err != nil {
		return false
	}

	var ch ChannelConfig
	if err := json.Unmarshal([]byte(val), &ch); err != nil {
		log.Printf("[WARN] Invalid channel config for %s: %v", key, err)
		return false
	}

	// 只处理 Vertex 类型的启用渠道
	if ch.Type != "vertex" || ch.State != 1 {
		return false
	}

	// 2. 检查现有的 Real Token
	realTokenKey := KeyPrefixRealToken + channelID
	// We only need the error to check existence, not the value
	_, err = tm.rdb.Get(ctx, realTokenKey).Result()
	
	needsRefresh := false
	
	if err == redis.Nil {
		needsRefresh = true
	} else if err == nil {
		// Token 存在，检查过期时间
		ttl, _ := tm.rdb.TTL(ctx, realTokenKey).Result()
		if ttl < TokenExpireMargin {
			needsRefresh = true
			log.Printf("[INFO] Token for channel %s is expiring in %v, refreshing...", channelID, ttl)
		}
	}

	if needsRefresh {
		tm.refreshToken(ctx, channelID, ch.Key)
		return true
	}
	return false
}

func (tm *TokenManager) refreshToken(ctx context.Context, channelID, saJSON string) {
	// 1. 调用 Google API
	tokenResp, err := RefreshTokenFromServiceAccount(saJSON)
	if err != nil {
		log.Printf("[ERROR] Failed to refresh token for channel %s: %v", channelID, err)
		return
	}

	// 2. 写入 Redis
	// 兼容 Lua 逻辑：Lua 直接读取这个 Key 作为 Token 字符串
	// 所以我们直接存 AccessToken 字符串，不要存 JSON
	realTokenKey := KeyPrefixRealToken + channelID
	
	// 过期时间：Google 返回的 expiresIn (通常 3600s) - buffer (60s)
	ttl := time.Duration(tokenResp.ExpiresIn-60) * time.Second
	
	err = tm.rdb.Set(ctx, realTokenKey, tokenResp.AccessToken, ttl).Err()
	if err != nil {
		log.Printf("[ERROR] Failed to save token to Redis: %v", err)
	} else {
		log.Printf("[SUCCESS] Refreshed token for channel %s (TTL: %v)", channelID, ttl)
	}
}