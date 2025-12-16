package processor

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

const (
	KeyPrefixChannel = "oauth2:channel:"
)

type DBChannel struct {
	ID           int    `json:"id"`
	Type         string `json:"type"`
	Key          string `json:"key"`
	State        int    `json:"state"`
	ModelsConfig string `json:"models_config"`
}

type SyncManager struct {
	rdb *redis.Client
	db  *sql.DB
}

func NewSyncManager(rdb *redis.Client, db *sql.DB) *SyncManager {
	return &SyncManager{
		rdb: rdb,
		db:  db,
	}
}

// OpenNewDB creates a new DB connection for LogConsumer
func (sm *SyncManager) OpenNewDB(dsn string) (*sql.DB, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(20) 
	db.SetMaxIdleConns(5)
	return db, nil
}

func (sm *SyncManager) Start(ctx context.Context) {
	log.Println("[INFO] Sync Manager started.")
	sm.performSync(ctx)
	go sm.startWatchdog(ctx)

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sm.performSync(ctx)
		}
	}
}

func (sm *SyncManager) startWatchdog(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	
	log.Println("[INFO] Watchdog started (5s interval)")

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			exists, err := sm.rdb.Exists(ctx, "oauth2:model_prices").Result()
			if err != nil {
				log.Printf("[WARN] Watchdog Redis check failed: %v", err)
				continue
			}
			if exists == 0 {
				log.Println("[WARN] Watchdog Alert: Critical cache 'oauth2:model_prices' missing! Triggering sync...")
				sm.performSync(ctx)
				time.Sleep(10 * time.Second)
			}
		}
	}
}

func (sm *SyncManager) ReportJobStatus(ctx context.Context, status, lastResult string) {
	now := time.Now()
	jobData := map[string]interface{}{
		"name":        "db_sync_job",
		"description": "Sync MySQL channels/tokens to Redis (Go Service)",
		"interval":    300000,
		"lastRun":     now,
		"nextRun":     now.Add(5 * time.Minute),
		"lastResult":  lastResult,
		"status":      status,
		"updated_at":  now.Unix(),
	}
	val, _ := json.Marshal(jobData)
	sm.rdb.Set(ctx, "oauth2:sys:job:db_sync", string(val), 0)
}

func (sm *SyncManager) performSync(ctx context.Context) {
	sm.ReportJobStatus(ctx, "running", "Syncing DB to Redis...")
	start := time.Now()
	var errs []string

	if err := sm.syncChannels(ctx); err != nil {
		errMsg := fmt.Sprintf("Sync channels failed: %v", err)
		log.Printf("[ERROR] %s", errMsg)
		errs = append(errs, errMsg)
	}

	if err := sm.syncModels(ctx); err != nil {
		errMsg := fmt.Sprintf("Sync models failed: %v", err)
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

func (sm *SyncManager) ForceRun() {
	log.Println("[INFO] Force running DB Sync Job...")
	go sm.performSync(context.Background())
}

func (sm *SyncManager) syncModels(ctx context.Context) error {
	rows, err := sm.db.Query("SELECT name, price_input, price_output, price_request, price_time, price_cache, is_async FROM sys_models WHERE status = 1")
	if err != nil {
		return err
	}
	defer rows.Close()

	priceMap := make(map[string]interface{})

	for rows.Next() {
		var name string
		var pInput, pOutput, pRequest, pTime, pCache sql.NullFloat64
		var isAsync int
		
		if err := rows.Scan(&name, &pInput, &pOutput, &pRequest, &pTime, &pCache, &isAsync); err != nil {
			continue
		}

		priceMap[name] = map[string]interface{}{
			"input":    pInput.Float64,
			"output":   pOutput.Float64,
			"request":  pRequest.Float64,
			"time":     pTime.Float64,
			"cache":    pCache.Float64,
			"is_async": isAsync == 1,
		}
	}

	valBytes, _ := json.Marshal(priceMap)
	if err := sm.rdb.Set(ctx, "oauth2:model_prices", string(valBytes), 0).Err(); err != nil {
		return err
	}
	log.Printf("[INFO] Synced %d models prices to Redis", len(priceMap))
	return nil
}

func (sm *SyncManager) syncChannels(ctx context.Context) error {
	rows, err := sm.db.Query("SELECT id, type, `credentials`, status, models_config FROM sys_channels WHERE status = 1")
	if err != nil {
		return err
	}
	defer rows.Close()

	activeChannelIDs := make(map[int]bool)

	for rows.Next() {
		var ch DBChannel
		var modelsConfigStr sql.NullString
		if err := rows.Scan(&ch.ID, &ch.Type, &ch.Key, &ch.State, &modelsConfigStr); err != nil {
			continue
		}
		activeChannelIDs[ch.ID] = true

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
		redisKey := fmt.Sprintf("%s%d", KeyPrefixChannel, ch.ID)
		if err := sm.rdb.Set(ctx, redisKey, string(valBytes), 0).Err(); err != nil {
			log.Printf("[WARN] Failed to set channel %d: %v", ch.ID, err)
		}
	}

	iter := sm.rdb.Scan(ctx, 0, KeyPrefixChannel+"*", 0).Iterator()
	deletedCount := 0
	for iter.Next(ctx) {
		key := iter.Val()
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
