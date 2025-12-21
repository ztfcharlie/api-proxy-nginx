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
		Addr: addr,
	})
	return &RedisStore{client: rdb}
}

func (r *RedisStore) RegisterAgent(ctx context.Context, agentID string) error {
	return r.client.Set(ctx, "agent_online:"+agentID, "local", 60*time.Second).Err()
}

func (r *RedisStore) UnregisterAgent(ctx context.Context, agentID string) error {
	return r.client.Del(ctx, "agent_online:"+agentID).Err()
}

func (r *RedisStore) RateLimit(ctx context.Context, key string, limit int, window time.Duration) (bool, int64, error) {
	script := `
	local current = redis.call("INCR", KEYS[1])
	if current == 1 then
		redis.call("EXPIRE", KEYS[1], ARGV[1])
	end
	if current > tonumber(ARGV[2]) then
		return 0, current
	else
		return 1, current
	end
	`
	res, err := r.client.Eval(ctx, script, []string{key}, int(window.Seconds()), limit).Result()
	if err != nil {
		return false, 0, err
	}
	
	val := res.(int64) 
	return val == 1, 0, nil
}

func (r *RedisStore) IncrUserActive(ctx context.Context, userID int) (int64, error) {
	return r.client.Incr(ctx, fmtKey(userID)).Result()
}

func (r *RedisStore) DecrUserActive(ctx context.Context, userID int) error {
	return r.client.Decr(ctx, fmtKey(userID)).Err()
}

func fmtKey(uid int) string {
	return fmt.Sprintf("user_active:%d", uid)
}

// IncrAgentIncome 增加 Agent 待结算收入 (Redis原子操作)
func (r *RedisStore) IncrAgentIncome(ctx context.Context, agentID string, amount float64) error {
	return r.client.IncrByFloat(ctx, "agent_income:"+agentID, amount).Err()
}