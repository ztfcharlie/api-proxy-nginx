package cache

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisStore struct {
	client *redis.Client
}

func NewRedisStore(addr string) *RedisStore {
	rdb := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     "", // no password set
		DB:           0,  // use default DB
		PoolSize:     100,
		MinIdleConns: 10,
	})
	return &RedisStore{client: rdb}
}

// ... (Register/Unregister 代码不变，略) ...
func (r *RedisStore) RegisterAgent(ctx context.Context, agentID string) error {
	return r.client.Set(ctx, "agent_online:"+agentID, "local", 60*time.Second).Err()
}
func (r *RedisStore) UnregisterAgent(ctx context.Context, agentID string) error {
	return r.client.Del(ctx, "agent_online:"+agentID).Err()
}
// ...

// CheckRPM (Lua) - 检查每分钟请求数
func (r *RedisStore) CheckRPM(ctx context.Context, key string, limit int) (bool, error) {
	if limit <= 0 { return true, nil } // 无限制
	
	script := `
	local current = redis.call("INCR", KEYS[1])
	if current == 1 then
		redis.call("EXPIRE", KEYS[1], 60) -- 窗口固定 60秒
	end
	if current > tonumber(ARGV[1]) then
		return 0
	else
		return 1
	end
	`
	res, err := r.client.Eval(ctx, script, []string{key}, limit).Result()
	if err != nil {
		return false, err
	}
	return res.(int64) == 1, nil
}

// IncrConcurrency - 增加并发计数
func (r *RedisStore) IncrConcurrency(ctx context.Context, key string, max int) (bool, error) {
	if max <= 0 { return true, nil } // 无限制

	// 这是一个原子操作吗？Incr 是原子的，但 Check 不是。
	// 但对于并发控制，稍微超一点点是可以接受的 (Soft Limit)。
	// 如果要严格，需要用 Lua。这里演示简单做法。
	
	curr, err := r.client.Incr(ctx, key).Result()
	if err != nil { return false, err }
	
	if int(curr) > max {
		r.client.Decr(ctx, key) // 回滚
		return false, nil
	}
	return true, nil
}

// DecrConcurrency - 释放并发计数
func (r *RedisStore) DecrConcurrency(ctx context.Context, key string) {
	r.client.Decr(ctx, key)
}

func (r *RedisStore) IncrAgentIncome(ctx context.Context, agentID string, amount float64) error {
	return r.client.IncrByFloat(ctx, "agent_income:"+agentID, amount).Err()
}

// IncrUserActive (保留用于兼容旧代码，但建议用通用的 IncrConcurrency)
func (r *RedisStore) IncrUserActive(ctx context.Context, userID int) (int64, error) {
	key := fmt.Sprintf("user:active:%d", userID)
	val, err := r.client.Incr(ctx, key).Result()
	// Set TTL to 1 hour to prevent permanent lock if crash happens
	r.client.Expire(ctx, key, 1*time.Hour)
	return val, err
}
func (r *RedisStore) DecrUserActive(ctx context.Context, userID int) error {
	return r.client.Decr(ctx, fmt.Sprintf("user_active:%d", userID)).Err()
}
