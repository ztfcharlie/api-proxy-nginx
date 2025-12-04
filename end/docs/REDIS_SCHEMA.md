# Redis Key 结构定义

## 1. 真实凭证缓存 (由 Node.js 维护, Lua 读取)
# 用于 Vertex AI 等需要动态刷新 Token 的场景
Key: `real_token:{channel_id}`
Value: String (真实的 Access Token)
TTL: 3500秒 (Google Token 有效期通常为 1 小时)

## 2. 虚拟 Access Token 映射 (由 Node.js OAuth2 接口生成, Lua 读取)
# 用于 Vertex AI 客户端请求 API 时携带的 token
Key: `vtoken:{virtual_access_token}`
Value: JSON
{
  "virtual_key_id": 123,
  "user_id": 456,
  "scope": "..."
}
TTL: 3600秒

## 3. 路由规则缓存 (由 Node.js 配置变更时同步, Lua 读取)
# 将 Virtual Key ID 映射到一组 Channel ID
Key: `route:{virtual_key_id}`
Value: JSON List
[
  { "channel_id": 1, "weight": 100, "models": ["gemini-pro"] },
  { "channel_id": 2, "weight": 50, "models": ["gemini-pro"] }
]

## 4. 虚拟 Key 索引 (用于 OpenAI 风格直接透传)
Key: `vkey_idx:{access_key}`  (例如 sk-mock-xxxx)
Value: {virtual_key_id}
