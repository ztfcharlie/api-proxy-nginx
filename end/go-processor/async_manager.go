package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type AsyncTaskManager struct {
	db  *sql.DB
	rdb *redis.Client
}

func NewAsyncTaskManager(rdb *redis.Client, db *sql.DB) *AsyncTaskManager {
	return &AsyncTaskManager{rdb: rdb, db: db}
}

func (m *AsyncTaskManager) Start(ctx context.Context) {
	log.Println("[INFO] Async Task Manager started.")
	
	// Poll every 10 seconds
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.processTasks(ctx)
		}
	}
}

func (m *AsyncTaskManager) processTasks(ctx context.Context) {
	// 1. Fetch pending tasks created within last 30 minutes
	rows, err := m.db.QueryContext(ctx, `
		SELECT id, request_id, user_id, channel_id, token_key, provider, upstream_task_id, pre_cost, created_at 
		FROM sys_async_tasks 
		WHERE status IN ('PENDING', 'PROCESSING') 
		AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
		LIMIT 50
	`)
	if err != nil {
		log.Printf("[Async] Failed to fetch tasks: %v", err)
		return
	}
	defer rows.Close()

	var wg sync.WaitGroup
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.ReqID, &t.UserID, &t.ChannelID, &t.TokenKey, &t.Provider, &t.UpstreamID, &t.PreCost, &t.CreatedAt); err != nil {
			continue
		}
		
		wg.Add(1)
		go func(task Task) {
			defer wg.Done()
			m.checkTaskStatus(ctx, task)
		}(t)
	}
	wg.Wait()
}

type Task struct {
	ID         int64
	ReqID      string
	UserID     int
	ChannelID  int
	TokenKey   string // [Added]
	Provider   string
	UpstreamID string
	PreCost    float64
	CreatedAt  time.Time
}

func (m *AsyncTaskManager) checkTaskStatus(ctx context.Context, task Task) {
	// [Refactor] Poll via Nginx using Sticky Routing
	// We don't need channel config anymore, Nginx handles it
	
	url := ""
	// Determine endpoint based on provider (or store path in DB?)
	// For now, hardcode for known providers
	if task.Provider == "openai" {
		// OpenAI / Mock Sora
		url = fmt.Sprintf("http://api-proxy-nginx:8080/v1/videos/%s", task.UpstreamID)
	} else if task.Provider == "suno" {
		url = fmt.Sprintf("http://api-proxy-nginx:8080/suno/fetch/%s", task.UpstreamID)
	} else {
		// Generic fallback
		return
	}

	req, _ := http.NewRequest("GET", url, nil)
	// Use the original Virtual Token
	req.Header.Set("Authorization", "Bearer "+task.TokenKey)
	// Add a header to indicate internal polling (optional, for log tagging)
	req.Header.Set("X-Internal-Poll", "true")
	
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[Async] Poll failed for %s: %v", task.UpstreamID, err)
		return
	}
	defer resp.Body.Close()

	// Response handling is done by LogConsumer! 
	// We just fire the request.
	// BUT: LogConsumer updates the status.
	// If we don't read the response here, LogConsumer will still process it.
	// However, if we want to stop polling when succeeded, we should check status here too.
	// Or rely on DB update in next scan? (Next scan query filters by PENDING).
	// So checking here is redundant but good for immediate feedback.
	
	// Let's read status to log it
	if resp.StatusCode == 200 {
		// LogConsumer handles the update.
		log.Printf("[Async] Polled %s via Nginx (Status 200)", task.UpstreamID)
	} else {
		log.Printf("[Async] Poll %s returned %d", task.UpstreamID, resp.StatusCode)
	}
}

func (m *AsyncTaskManager) updateTaskStatus(ctx context.Context, id int64, status, result string) {
	m.db.ExecContext(ctx, "UPDATE sys_async_tasks SET status = ?, response_json = ?, updated_at = NOW() WHERE id = ?", status, result, id)
}

func (m *AsyncTaskManager) processRefund(ctx context.Context, task Task) {
	if task.PreCost <= 0 {
		return
	}
	
	log.Printf("[Async] Refunding %.6f to user %d for task %s", task.PreCost, task.UserID, task.ReqID)
	
	// Insert negative log record
	// Note: We use a special request_id prefix "REFUND-"
	refundReqID := fmt.Sprintf("REFUND-%s", task.ReqID)
	
	_, err := m.db.ExecContext(ctx, `
		INSERT INTO sys_request_logs 
		(request_id, user_id, channel_id, model, request_uri, status_code, duration_ms, cost, ip, user_agent, req_body, res_body, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
	`, refundReqID, task.UserID, task.ChannelID, "refund", "/sys/refund", 200, 0, -task.PreCost, "127.0.0.1", "GoAsyncManager", "", "Task Failed Refund")

	if err != nil {
		log.Printf("[Async] Refund DB Insert Failed: %v", err)
	}
}
