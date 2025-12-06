package main

import (
	"context"
	"encoding/json"
	"fmt"
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
	log.Println("[INFO] Starting Go Log Processor...")

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

	// 2. 确保 Consumer Group 存在
	// XGROUP CREATE stream:api_logs log_processor_group $ MKSTREAM
	err := rdb.XGroupCreateMkStream(ctx, StreamKey, ConsumerGroup, "$").Err()
	if err != nil {
		if !strings.Contains(err.Error(), "BUSYGROUP") {
			log.Fatalf("[CRITICAL] Failed to create consumer group: %v", err)
		}
		// 如果是 BUSYGROUP 错误，说明组已经存在，忽略即可
		log.Println("[INFO] Consumer group already exists, resuming...")
	}

	// 3. 优雅退出的信号处理
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// [Added] 启动 Token 刷新管理器
	tm := NewTokenManager(rdb)
	go tm.Start(ctx)

	// [Added] 启动数据库同步管理器 (Reconciliation)
	dbUser := getEnv("DB_USER", "oauth2_user")
	dbPass := getEnv("DB_PASSWORD", "oauth2_password_123456")
	dbHost := getEnv("DB_HOST", "api-proxy-mysql")
	dbPort := getEnv("DB_PORT", "3306")
	dbName := getEnv("DB_NAME", "oauth2_mock")
	
	// DSN: user:password@tcp(host:port)/dbname
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True", dbUser, dbPass, dbHost, dbPort, dbName)
	
	sm, err := NewSyncManager(rdb, dsn)
	if err != nil {
		log.Printf("[ERROR] Failed to connect to MySQL, SyncManager disabled: %v", err)
	} else {
		go sm.Start(ctx)
	}

	// [Added] 启动 Redis Pub/Sub 监听器 (用于远程触发任务)
	go func() {
		// 频道名需要与 Node.js RedisService 的 keyPrefix 匹配
		// Node.js default prefix: "oauth2:"
		const triggerChannel = "oauth2:cmd:job:trigger"
		
		pubsub := rdb.Subscribe(ctx, triggerChannel)
		defer pubsub.Close()

		// 等待订阅成功
		if _, err := pubsub.Receive(ctx); err != nil {
			log.Printf("[ERROR] Failed to subscribe to trigger channel: %v", err)
			return
		}
		
		log.Printf("[INFO] Listening for job triggers on %s", triggerChannel)
		ch := pubsub.Channel()

		for msg := range ch {
			log.Printf("[INFO] Received trigger command: %s", msg.Payload)
			
			// 这里的 msg.Payload 实际上是 JSON 字符串 (RedisService.publish 做了 JSON.stringify)
			// 但如果直接传字符串 "token_refresh_job"，JSON.stringify 后是 "\"token_refresh_job\""
			// 所以我们需要去掉可能存在的引号
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

	// 4. 开始消费循环
	log.Println("[INFO] Waiting for messages...")

	for {
		select {
		case <-sigChan:
			log.Println("[INFO] Shutting down...")
			return
		default:
			// 阻塞读取消息 (Block 2秒)
			streams, err := rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
				Group:    ConsumerGroup,
				Consumer: ConsumerName,
				Streams:  []string{StreamKey, ">"}, // ">" 表示读取未被消费的新消息
				Count:    10,                       // 每次批处理 10 条
				Block:    2 * time.Second,
			}).Result()

			if err == redis.Nil {
				continue // 超时无消息，继续下一轮
			}
			if err != nil {
				log.Printf("[ERROR] Redis XReadGroup error: %v", err)
				time.Sleep(1 * time.Second) // 避免死循环刷屏
				continue
			}

			// 处理每一条消息
			for _, stream := range streams {
				for _, msg := range stream.Messages {
					processMessage(msg)

					// 确认消费 (ACK)
					// 只有 ACK 后，Redis 才会认为这条消息处理完了，可以从 Pending List 移除
					// 注意：Stream 的数据本体还在，直到达到 MAXLEN 被挤出，但 Pending 状态已清除
					if err := rdb.XAck(ctx, StreamKey, ConsumerGroup, msg.ID).Err(); err != nil {
						log.Printf("[ERROR] Failed to ACK message %s: %v", msg.ID, err)
					}
				}
			}
		}
	}
}

// processMessage 处理单条日志
func processMessage(msg redis.XMessage) {
	// 从 Map 中提取字段
	values := msg.Values
	
	reqID, _ := values["req_id"].(string)
	metaStr, _ := values["meta"].(string)
	// reqBody, _ := values["req_body"].(string) 
	// resBody, _ := values["res_body"].(string) 

	// 简单的日志打印，证明我们在工作
	log.Printf("[PROCESS] MsgID: %s | ReqID: %s | MetaLen: %d", msg.ID, reqID, len(metaStr))

	// ==========================================
	// TODO: 计费与审计逻辑将在这里实现
	// ==========================================
	// 1. Unmarshal metaStr -> struct
	// 2. Parse reqBody/resBody (JSON Decode)
	// 3. Calculate Tokens (Prompt + Completion)
	// 4. Calculate Price (based on Model in Meta)
	// 5. Insert into MySQL (batch insert recommended)
	// ==========================================
	
	// 解析 metadata 示例 (为了调试)
	if metaStr != "" {
		var meta map[string]interface{}
		if err := json.Unmarshal([]byte(metaStr), &meta); err == nil {
			if status, ok := meta["status"]; ok {
				// 如果状态码是 429，这里也可以做一个特殊的告警
				if sNum, ok := status.(float64); ok && sNum == 429 {
					log.Printf("[ALERT] 429 Detected for ReqID: %s", reqID)
				}
			}
		}
	}
}

// getEnv 获取环境变量
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
