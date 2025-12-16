package processor

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	KeyPrefixRealToken = "oauth2:real_token:"
	TokenExpireMargin  = 300 * time.Second 
)

type ChannelConfig struct {
	ID           int                    `json:"id"`
	Type         string                 `json:"type"` 
	Key          string                 `json:"key"`  
	ModelsConfig map[string]interface{} `json:"models_config"`
	State        int                    `json:"state"` 
}

type TokenData struct {
	AccessToken string `json:"access_token"`
	ExpiresAt   int64  `json:"expires_at"` 
}

type TokenManager struct {
	rdb     *redis.Client
	db      *sql.DB
	failMap map[string]time.Time 
	failMu  sync.Mutex
}

func NewTokenManager(rdb *redis.Client, db *sql.DB) *TokenManager {
	return &TokenManager{
		rdb:     rdb,
		db:      db,
		failMap: make(map[string]time.Time),
	}
}

func (tm *TokenManager) Start(ctx context.Context) {
	log.Println("[INFO] Token Refresher started.")
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

func (tm *TokenManager) ReportJobStatus(ctx context.Context, status, lastResult string) {
	now := time.Now()
	jobData := map[string]interface{}{
		"name":        "token_refresh_job",
		"description": "Auto refresh Vertex/Google tokens (Go Service)",
		"interval":    10000, 
		"lastRun":     now,
		"nextRun":     now.Add(10 * time.Second),
		"lastResult":  lastResult,
		"status":      status,
		"updated_at":  now.Unix(),
	}
	
	val, _ := json.Marshal(jobData)
	tm.rdb.Set(ctx, "oauth2:sys:job:token_refresh", string(val), 0)
}

func (tm *TokenManager) scanAndRefresh(ctx context.Context) {
	tm.ReportJobStatus(ctx, "running", "Scanning...")

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
	sem := make(chan struct{}, 5) 
	
	var refreshCount int
	var mu sync.Mutex

	for _, key := range keys {
		wg.Add(1)
		go func(k string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }() 

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

func (tm *TokenManager) ForceRun() {
	log.Println("[INFO] Force running Token Refresh Job...")
	go tm.scanAndRefresh(context.Background())
}

func (tm *TokenManager) processChannel(ctx context.Context, key string) bool {
	parts := strings.Split(key, ":")
	if len(parts) < 3 {
		return false
	}
	channelID := parts[2]

	tm.failMu.Lock()
	nextRetry, exists := tm.failMap[channelID]
	tm.failMu.Unlock()

	if exists && time.Now().Before(nextRetry) {
		return false
	}

	val, err := tm.rdb.Get(ctx, key).Result()
	if err != nil {
		return false
	}

	var ch ChannelConfig
	if err := json.Unmarshal([]byte(val), &ch); err != nil {
		return false
	}

	if ch.Type != "vertex" || ch.State != 1 {
		return false
	}

	realTokenKey := KeyPrefixRealToken + channelID
	_, err = tm.rdb.Get(ctx, realTokenKey).Result()
	
	needsRefresh := false
	
	if err == redis.Nil {
		needsRefresh = true
	} else if err == nil {
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
	tokenResp, err := RefreshTokenFromServiceAccount(saJSON)
	if err != nil {
		log.Printf("[ERROR] Failed to refresh token for channel %s: %v", channelID, err)
		
		tm.failMu.Lock()
		tm.failMap[channelID] = time.Now().Add(5 * time.Minute)
		tm.failMu.Unlock()

		if tm.db != nil {
			errMsg := fmt.Sprintf("Token Refresh Failed: %v", err)
			tm.db.ExecContext(ctx, "UPDATE sys_channels SET last_error = ?, updated_at = NOW() WHERE id = ?", errMsg, channelID)
		}
		return
	}

	tm.failMu.Lock()
	delete(tm.failMap, channelID)
	tm.failMu.Unlock()

	realTokenKey := KeyPrefixRealToken + channelID
	
	ttl := time.Duration(tokenResp.ExpiresIn-60) * time.Second
	
	err = tm.rdb.Set(ctx, realTokenKey, tokenResp.AccessToken, ttl).Err()
	if err != nil {
		log.Printf("[ERROR] Failed to save token to Redis: %v", err)
	} else {
		log.Printf("[SUCCESS] Refreshed token for channel %s (TTL: %v)", channelID, ttl)
		if tm.db != nil {
			expiresAt := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)
			tm.db.ExecContext(ctx, "UPDATE sys_channels SET last_error = NULL, current_access_token = ?, token_expires_at = ?, updated_at = NOW() WHERE id = ?", tokenResp.AccessToken, expiresAt, channelID)
		}
	}
}
