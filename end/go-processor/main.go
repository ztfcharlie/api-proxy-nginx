package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
)

// 配置常量
const (
	StreamKey     = "stream:api_logs"
	ConsumerGroup = "log_processor_group"
	ConsumerName  = "worker-1" // 在多副本部署时，这里最好用 os.Hostname()
)

var ctx = context.Background()

func main() {
	// [Added] 配置日志双向输出 (Stdout + File)
	logPath := "/app/logs/processor.log"
	// 确保目录存在 (虽然 docker 挂载会自动创建，但防万一)
	os.MkdirAll("/app/logs", 0755)
	
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		fmt.Printf("Failed to open log file: %v, using stdout only\n", err)
	} else {
		defer logFile.Close()
		mw := io.MultiWriter(os.Stdout, logFile)
		log.SetOutput(mw)
	}

	log.Println("[INFO] Starting Go Core Service...")

	// 1. 初始化 Redis 连接
	redisAddr := fmt.Sprintf("%s:%s", getEnv("REDIS_HOST", "localhost"), getEnv("REDIS_PORT", "6379"))
	password := getEnv("REDIS_PASSWORD", "")
	log.Printf("[INFO] Connecting to Redis at %s...", redisAddr)

	rdb := redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: password,
		DB:       0,
	})

	// 测试连接
	if _, err := rdb.Ping(ctx).Result(); err != nil {
		log.Fatalf("[CRITICAL] Failed to connect to Redis: %v", err)
	}
	log.Println("[INFO] Redis connected successfully.")

	// 2. 初始化数据库连接 (用于 SyncManager 和 LogConsumer)
	dbUser := getEnv("DB_USER", "oauth2_user")
	dbPass := getEnv("DB_PASSWORD", "oauth2_password_123456")
	dbHost := getEnv("DB_HOST", "api-proxy-mysql")
	dbPort := getEnv("DB_PORT", "3306")
	dbName := getEnv("DB_NAME", "oauth2_mock")
	
	// DSN: user:password@tcp(host:port)/dbname
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True", dbUser, dbPass, dbHost, dbPort, dbName)
	
	// Component B: Sync Manager (DB <-> Redis)
	sm, err := NewSyncManager(rdb, dsn)
	var tm *TokenManager

	if err != nil {
		log.Printf("[ERROR] Failed to connect to MySQL, SyncManager & LogConsumer disabled: %v", err)
		// 即使 DB 挂了，TokenManager 也要尝试运行 (虽然没法上报错误)
		tm = NewTokenManager(rdb, nil)
	} else {
		go sm.Start(ctx)
		
		// Component C: Log Consumer
		lcDB, err := sm.OpenNewDB(dsn)
		if err == nil {
			lc := NewLogConsumer(rdb, lcDB)
			go lc.Start(ctx)
			
			// [Added] Component F: Async Task Manager
			asyncMgr := NewAsyncTaskManager(rdb, lcDB)
			go asyncMgr.Start(ctx)
		} else {
			log.Printf("[ERROR] Failed to open DB for LogConsumer: %v", err)
		}

		// Component A: Token Manager (Auto Refresh)
		// 复用 sm 的辅助方法开连接
		tmDB, err := sm.OpenNewDB(dsn)
		if err != nil {
			log.Printf("[WARN] Failed to open DB for TokenManager, error reporting disabled: %v", err)
			tm = NewTokenManager(rdb, nil)
		} else {
			tm = NewTokenManager(rdb, tmDB)
		}
	}

	go tm.Start(ctx)

	// Component D: Redis Pub/Sub Listener (Remote Control)
	go func() {
		const triggerChannel = "oauth2:cmd:job:trigger"
		pubsub := rdb.Subscribe(ctx, triggerChannel)
		defer pubsub.Close()

		if _, err := pubsub.Receive(ctx); err != nil {
			log.Printf("[ERROR] Failed to subscribe to trigger channel: %v", err)
			return
		}
		
		log.Printf("[INFO] Listening for job triggers on %s", triggerChannel)
		ch := pubsub.Channel()

		for msg := range ch {
			log.Printf("[INFO] Received trigger command: %s", msg.Payload)
			cmd := strings.Trim(msg.Payload, "\"")

			switch cmd {
			case "token_refresh_job":
				tm.ForceRun()
			case "db_sync_job":
				if sm != nil {
					sm.ForceRun()
				}
			default:
				log.Printf("[WARN] Unknown job trigger: %s", cmd)
			}
		}
	}()

	// [Added] Component E: Heartbeat
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		log.Println("[INFO] Starting heartbeat sender...")
		
		for {
			select {
			case <-ctx.Done():
				return
			case t := <-ticker.C:
				// 写入心跳 Key，TTL 15秒
				// Key: oauth2:sys:heartbeat:go-processor (Redis客户端会自动加 oauth2: 前缀吗? 
				// 注意：这里的 rdb 是 go-redis，不会自动加前缀，除非我们在 Options 里配了 hooks。
				// 我们之前的约定是手动加前缀吗？
				// 让我们看 log_consumer.go，那里是直接 fmt.Sprintf("oauth2:channel:%d")。
				// 所以这里也要手动加。
				err := rdb.Set(ctx, "oauth2:sys:heartbeat:go-processor", t.Unix(), 15*time.Second).Err()
				if err != nil {
					log.Printf("[WARN] Failed to send heartbeat: %v", err)
				}
			}
		}
	}()

	// 优雅退出
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	
	log.Println("[INFO] All services started. Waiting for signals...")
	<-sigChan
	log.Println("[INFO] Shutting down...")
}

// getEnv 获取环境变量
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

// [Added] Publish logs to Redis Stream for frontend debugging
func publishLog(rdb *redis.Client, level, msg string) {
	if rdb == nil || os.Getenv("ENABLE_DEBUG_STREAM") != "true" {
		return
	}
	
	payload := fmt.Sprintf(`{"ts":"%s", "source":"go-processor", "level":"%s", "msg":"%s"}`, 
		time.Now().Format(time.RFC3339), level, strings.ReplaceAll(msg, "\"", "\\\""))

	// Fire and forget, don't block
	go func() {
		// Redis Pub/Sub
		rdb.Publish(ctx, "sys:log_stream", payload)
	}()
}

// 封装后的 Logger
type RedisLogger struct {
	rdb *redis.Client
}

func (l *RedisLogger) Info(msg string, v ...interface{}) {
	text := fmt.Sprintf(msg, v...)
	log.Println("[INFO] " + text)
	publishLog(l.rdb, "info", text)
}

func (l *RedisLogger) Error(msg string, v ...interface{}) {
	text := fmt.Sprintf(msg, v...)
	log.Println("[ERROR] " + text)
	publishLog(l.rdb, "error", text)
}

func (l *RedisLogger) Warn(msg string, v ...interface{}) {
	text := fmt.Sprintf(msg, v...)
	log.Println("[WARN] " + text)
	publishLog(l.rdb, "warn", text)
}
