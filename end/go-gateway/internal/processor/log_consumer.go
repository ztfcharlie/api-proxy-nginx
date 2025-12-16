package processor

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	StreamKey     = "stream:api_logs"
	ConsumerGroup = "gateway_group"
	ConsumerName  = "gateway_worker"
)

type LogEntry struct {
	RequestID    string  `json:"request_id"`
	UserID       interface{} `json:"user_id"`
	ChannelID    int     `json:"channel_id,omitempty"` // Gateway 没传这个? 需检查
	TokenKey     string  `json:"token_key,omitempty"`  // Gateway 没传这个?
	Model        string  `json:"model"`
	InputTokens  int     `json:"input_tokens"`
	OutputTokens int     `json:"output_tokens"`
	TotalTokens  int     `json:"total_tokens"`
	Cost         float64 `json:"cost"`
	Timestamp    int64   `json:"timestamp"`
	IP           string  `json:"ip"`
	Status       int     `json:"status"` // Added to SettlementService?
	ReqBody      string  `json:"req_body,omitempty"` // Optional
	ResBody      string  `json:"res_body,omitempty"` // Optional
	ErrorMsg     string  `json:"error_msg,omitempty"`
}

type LogConsumer struct {
	rdb *redis.Client
	db  *sql.DB
}

func NewLogConsumer(rdb *redis.Client, db *sql.DB) *LogConsumer {
	return &LogConsumer{
		rdb: rdb,
		db:  db,
	}
}

func (lc *LogConsumer) Start(ctx context.Context) {
	log.Println("[INFO] Log Consumer started.")
	lc.rdb.XGroupCreateMkStream(ctx, StreamKey, ConsumerGroup, "$").Err()

	for {
		select {
		case <-ctx.Done():
			return
		default:
			streams, err := lc.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
				Group:    ConsumerGroup,
				Consumer: ConsumerName,
				Streams:  []string{StreamKey, ">"},
				Count:    20,
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

func (lc *LogConsumer) processBatch(ctx context.Context, msgs []redis.XMessage) {
	var valueStrings []string
	var valueArgs []interface{}
	var ackIDs []string

	for _, msg := range msgs {
		ackIDs = append(ackIDs, msg.ID)
		
		dataStr, ok := msg.Values["data"].(string)
		if !ok {
			// Try old format compatibility? No, assuming new format for now.
			continue 
		}

		var entry LogEntry
		if err := json.Unmarshal([]byte(dataStr), &entry); err != nil {
			log.Printf("[WARN] Failed to parse log entry: %v", err)
			continue
		}

		// Handle Channel Error
		if entry.Status >= 400 && entry.ChannelID > 0 {
			msg := entry.ErrorMsg
			if msg == "" { msg = fmt.Sprintf("HTTP %d", entry.Status) }
			lc.updateChannelError(entry.ChannelID, msg)
		} else if entry.Status == 200 && entry.ChannelID > 0 {
			lc.clearChannelError(entry.ChannelID)
		}

		valueStrings = append(valueStrings, "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
		valueArgs = append(valueArgs,
			entry.RequestID,
			entry.UserID,
			entry.ChannelID, // Need to make sure Settlement sends this
			"", // token_key (not strictly needed for billing but good for trace)
			entry.Model,
			"/proxy", // request_uri (Settlement needs to send this)
			entry.Status,
			0, // duration_ms (Settlement needs to send this)
			0, // upstream_duration
			entry.InputTokens,
			entry.OutputTokens,
			entry.TotalTokens,
			entry.Cost,
			entry.IP,
		)
	}

	if len(valueStrings) > 0 {
		stmt := fmt.Sprintf("INSERT INTO sys_request_logs (request_id, user_id, channel_id, token_key, model, request_uri, status_code, duration_ms, upstream_duration_ms, prompt_tokens, completion_tokens, total_tokens, cost, ip) VALUES %s", strings.Join(valueStrings, ","))
		
		_, err := lc.db.ExecContext(ctx, stmt, valueArgs...)
		if err != nil {
			log.Printf("[ERROR] Batch insert failed: %v", err)
		} else {
			lc.rdb.XAck(ctx, StreamKey, ConsumerGroup, ackIDs...)
		}
	} else if len(ackIDs) > 0 {
		lc.rdb.XAck(ctx, StreamKey, ConsumerGroup, ackIDs...)
	}
}

func (lc *LogConsumer) updateChannelError(channelID int, errorMsg string) {
	if channelID <= 0 { return }
	go func() {
		lc.db.Exec("UPDATE sys_channels SET last_error = ?, updated_at = NOW() WHERE id = ?", errorMsg, channelID)
	}()
}

func (lc *LogConsumer) clearChannelError(channelID int) {
	if channelID <= 0 { return }
	go func() {
		lc.db.Exec("UPDATE sys_channels SET last_error = NULL WHERE id = ? AND last_error IS NOT NULL", channelID)
	}()
}
