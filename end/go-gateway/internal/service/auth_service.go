package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"strconv"
	"strings"
	"time"

	"api-proxy/go-gateway/internal/model"
	"api-proxy/go-gateway/pkg/redis"

	redisgo "github.com/redis/go-redis/v9"
)

const (
	KeyPrefix         = "oauth2:"
	KeyPrefixChannel  = "oauth2:channel:"
	KeyPrefixRealToken= "oauth2:real_token:"
	KeyPrefixVToken   = "oauth2:vtoken:"
	KeyPrefixAPIKey   = "oauth2:apikey:"
)

type AuthService struct{}

func NewAuthService() *AuthService {
	return &AuthService{}
}

// AuthenticateClient 验证客户端 Token 并选择路由
// 返回: 客户端Token, 真实Upstream Token, Metadata, Error
func (s *AuthService) AuthenticateClient(ctx context.Context, clientToken, modelName, uri string) (*model.AuthContext, error) {
	// 1. 根据 Token 类型查询 Redis
	// 如果是 ya29.virtual 开头，则是 Vertex 模拟 Token
	// 否则是普通 API Key
	var metadata model.ClientTokenData
	var err error
	var routes []model.Route

	if strings.HasPrefix(clientToken, "yo39.virtual") {
		// Vertex Token Mode
		metadata, err = s.getVToken(ctx, clientToken)
		if err != nil {
			return nil, err
		}
		// 构造单路由
		routes = []model.Route{{
			ChannelID: metadata.ChannelID,
			Weight:    100,
			Type:      "vertex",
		}}
	} else {
		// API Key Mode
		metadata, err = s.getAPIKey(ctx, clientToken)
		if err != nil {
			return nil, err
		}
		routes = metadata.Routes
	}

	if len(routes) == 0 {
		return nil, fmt.Errorf("no routes available for this token")
	}

	// 2. 路由选择 (Routing Logic)
	// TODO: 实现 Sticky Route (异步任务) - 暂时跳过，后续迭代添加

	// 3. 智能路由 (Smart Route)
	// 过滤支持该模型的渠道 -> 加权随机 -> 检查 RPM
	targetRoute, realToken, err := s.selectRoute(ctx, routes, modelName)
	if err != nil {
		return nil, err
	}

	// 4. 解析目标主机 (Host Resolution)
	host := s.resolveHost(targetRoute.Type, metadata.ExtraConfig, targetRoute.ChannelID, modelName) // 简化版，需完善

	return &model.AuthContext{
		ClientToken: clientToken,
		RealToken:   realToken,
		ChannelID:   targetRoute.ChannelID,
		ChannelType: targetRoute.Type,
		TargetHost:  host,
		ModelName:   modelName,
		Metadata:    &metadata,
	}, nil
}

func (s *AuthService) getVToken(ctx context.Context, token string) (model.ClientTokenData, error) {
	key := KeyPrefixVToken + token
	val, err := redis.Client.Get(ctx, key).Result()
	if err != nil {
		if err == redisgo.Nil {
			return model.ClientTokenData{}, fmt.Errorf("invalid token")
		}
		return model.ClientTokenData{}, err
	}

	var data model.ClientTokenData
	if err := json.Unmarshal([]byte(val), &data); err != nil {
		return model.ClientTokenData{}, fmt.Errorf("malformed token data")
	}
	return data, nil
}

func (s *AuthService) getAPIKey(ctx context.Context, token string) (model.ClientTokenData, error) {
	key := KeyPrefixAPIKey + token
	val, err := redis.Client.Get(ctx, key).Result()
	if err != nil {
		if err == redisgo.Nil {
			return model.ClientTokenData{}, fmt.Errorf("invalid api key")
		}
		return model.ClientTokenData{}, err
	}

	var data model.ClientTokenData
	if err := json.Unmarshal([]byte(val), &data); err != nil {
		return model.ClientTokenData{}, fmt.Errorf("malformed api key data")
	}
	return data, nil
}

// selectRoute 路由选择算法
func (s *AuthService) selectRoute(ctx context.Context, routes []model.Route, modelName string) (*model.Route, string, error) {
	// A. 过滤 (此处应检查 Channel 是否支持 Model，暂略，假设都支持)
	candidates := routes

	// B. 加权随机 (Weighted Shuffle)
	// 简单实现：按权重构建池子然后随机选，或者累加权重法
	// 这里使用简单的加权随机选择一个，然后尝试
	// 完整的 Shuffle 逻辑比较复杂，先实现简单的重试机制
	
	// 计算总权重
	totalWeight := 0
	for _, r := range candidates {
		if r.Weight <= 0 { r.Weight = 1 } // 默认权重
		totalWeight += r.Weight
	}

	// 最多尝试 3 次
	for i := 0; i < 3; i++ {
		r := rand.Intn(totalWeight)
		var selected *model.Route
		accum := 0
		for _, route := range candidates {
			accum += route.Weight
			if r < accum {
				selected = &route
				break
			}
		}
		
		if selected == nil {
			selected = &candidates[len(candidates)-1]
		}

		// C. 检查 RPM
		if s.checkRateLimit(ctx, selected.ChannelID, selected.RpmLimit) {
			// D. 获取 Real Token
			token, err := s.getRealToken(ctx, selected)
			if err == nil && token != "" {
				return selected, token, nil
			} else {
				log.Printf("Failed to get real token for channel %d: %v", selected.ChannelID, err)
			}
		}
	}

	return nil, "", fmt.Errorf("all upstream routes failed or rate limited")
}

func (s *AuthService) checkRateLimit(ctx context.Context, channelID, limit int) bool {
	if limit <= 0 {
		return true
	}
	
	key := fmt.Sprintf("%sratelimit:channel:%d:model:global:%s", KeyPrefix, channelID, time.Now().Format("200601021504"))
	
	// Lua Script for Atomic Increment and Expire
	script := `
		local current = redis.call('GET', KEYS[1])
		if current and tonumber(current) >= tonumber(ARGV[1]) then
			return 0
		end
		redis.call('INCR', KEYS[1])
		if not current then
			redis.call('EXPIRE', KEYS[1], 65)
		end
		return 1
	`
	res, err := redis.Client.Eval(ctx, script, []string{key}, limit).Int()
	if err != nil {
		log.Printf("Rate limit check error: %v", err)
		return true // Fail open? Or closed? Lua says fail open (return 1) on error.
	}
	
	return res == 1
}

func (s *AuthService) getRealToken(ctx context.Context, route *model.Route) (string, error) {
	if route.Type == "mock" {
		return "mock-token", nil
	}
	
	if route.Type == "vertex" {
		// Key: oauth2:real_token:<id>
		key := KeyPrefixRealToken + strconv.Itoa(route.ChannelID)
		return redis.Client.Get(ctx, key).Result()
	}

	// OpenAI / Others: Token stored in Channel Config
	key := KeyPrefixChannel + strconv.Itoa(route.ChannelID)
	val, err := redis.Client.Get(ctx, key).Result()
	if err != nil {
		return "", err
	}
	
	var ch model.ChannelConfig
	if err := json.Unmarshal([]byte(val), &ch); err != nil {
		return "", err
	}
	
	if ch.Key != "" {
		return ch.Key, nil
	}
	if ch.Credentials != "" {
		return ch.Credentials, nil
	}
	
	return "", fmt.Errorf("no key found in channel config")
}

func (s *AuthService) resolveHost(channelType string, extraConfig map[string]interface{}, channelID int, modelName string) string {
	// 简化版 Host 解析
	switch channelType {
	case "vertex":
		// 需要从 Channel Config 里读 Region
		// 暂时硬编码 us-central1，后续需要优化：在 getRealToken 时顺便返回 Region 或 Metadata
		// 这是一个优化点：getRealToken 应该返回更多上下文
		return "us-central1-aiplatform.googleapis.com"
	case "openai":
		return "api.openai.com"
	case "deepseek":
		return "api.deepseek.com"
	case "anthropic":
		return "api.anthropic.com"
	case "mock":
		return "api-proxy-nodejs:8889"
	default:
		return "api.openai.com"
	}
}
