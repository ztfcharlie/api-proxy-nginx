# OAuth2认证时序图

```
客户端          nginx/OpenResty        Google OAuth2        Google Vertex AI
  |                    |                     |                      |
  |-- POST /v1/... --->|                     |                      |
  |  Authorization:     |                     |                      |
  |  Bearer client-key  |                     |                      |
  |                     |                     |                      |
  |                     |-- 检查token缓存 ---->|                      |
  |                     |<-- 缓存未命中 -------|                      |
  |                     |                     |                      |
  |                     |-- 读取服务账号 ----->|                      |
  |                     |<-- service_account --|                      |
  |                     |                     |                      |
  |                     |-- 创建JWT断言 ------>|                      |
  |                     |<-- jwt_assertion ----|                      |
  |                     |                     |                      |
  |                     |-- POST /token ------>|                      |
  |                     |   grant_type=jwt-bearer                    |
  |                     |   assertion=jwt_assertion                  |
  |                     |                     |                      |
  |                     |<-- access_token -----|                      |
  |                     |    expires_in=3600   |                      |
  |                     |                     |                      |
  |                     |-- 缓存token -------->|                      |
  |                     |                     |                      |
  |                     |-- 替换Authorization头 |                      |
  |                     |   Bearer access_token|                      |
  |                     |                     |                      |
  |                     |-- POST /v1/... -----|--------------------->|
  |                     |   Authorization:     |                      |
  |                     |   Bearer access_token|                      |
  |                     |                     |                      |
  |                     |                     |<-- API Response -----|
  |                     |<-- API Response -----|                      |
  |<-- API Response ----|                     |                      |
  |                     |                     |                      |
```

## 🔄 后续请求流程（使用缓存）

```
客户端          nginx/OpenResty        缓存               Google Vertex AI
  |                    |                |                      |
  |-- POST /v1/... --->|                |                      |
  |  Authorization:     |                |                      |
  |  Bearer client-key  |                |                      |
  |                     |                |                      |
  |                     |-- 检查缓存 ---->|                      |
  |                     |<-- 缓存命中 ----|                      |
  |                     |   access_token  |                      |
  |                     |                |                      |
  |                     |-- 替换头部 -----|                      |
  |                     |                |                      |
  |                     |-- POST /v1/... |--------------------->|
  |                     |                |                      |
  |                     |                |<-- API Response -----|
  |                     |<-- API Response|                      |
  |<-- API Response ----|                |                      |
  |                     |                |                      |
```