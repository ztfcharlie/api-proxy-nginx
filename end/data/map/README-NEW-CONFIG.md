# 新配置结构说明

## 概述

新的 `map-config.json` 统一了之前的三个配置文件：
- ~~map-client.json~~ (客户端启用/禁用)
- ~~map-client-json.json~~ (客户端到服务账号映射)
- ~~map-json-model-region.json~~ (服务账号到模型和域名映射)

## 配置结构

```json
{
  "clients": [...],           // 客户端配置列表
  "key_filename_gemini": [...], // Gemini 服务账号配置
  "key_filename_claude": [...]  // Claude 服务账号配置
}
```

## 客户端配置 (clients)

每个客户端包含以下字段：

```json
{
  "client_token": "gemini-client-key-aaaa",  // 客户端令牌（前缀决定服务类型）
  "enable": true,                             // 是否启用
  "key_filename_gemini": [                    // Gemini 服务账号列表
    {
      "key_filename": "hulaoban-202504.json", // 服务账号文件名
      "key_weight": 1                         // 权重（用于负载均衡）
    }
  ],
  "key_filename_claude": [...]                // Claude 服务账号列表（可选）
}
```

### 客户端令牌前缀规则

客户端令牌的**前缀**决定使用哪个服务：

- `gemini-*` → 使用 `key_filename_gemini` 配置
- `claude-*` → 使用 `key_filename_claude` 配置

示例：
- `gemini-client-key-aaaa` → Gemini 服务
- `claude-client-key-bbbb` → Claude 服务

## 服务账号配置

### Gemini 服务账号 (key_filename_gemini)

```json
{
  "key_filename": "hulaoban-202504.json",  // 服务账号文件名
  "models": [                               // 该账号支持的模型列表
    {
      "model": "gemini-3-pro-preview",     // 模型名称
      "domain": "aiplatform.googleapis.com" // API 域名
    }
  ]
}
```

### Claude 服务账号 (key_filename_claude)

结构与 Gemini 相同，但使用不同的域名。

## 权重负载均衡

当客户端配置了多个服务账号时，系统会根据权重进行选择：

```json
"key_filename_gemini": [
  {
    "key_filename": "company-vertex-1.json",
    "key_weight": 2  // 权重 2，被选中概率更高
  },
  {
    "key_filename": "company-vertex-2.json",
    "key_weight": 1  // 权重 1
  }
]
```

选择概率：
- company-vertex-1.json: 2/(2+1) = 66.7%
- company-vertex-2.json: 1/(2+1) = 33.3%

## Lazy Loading 机制

系统采用**按需加载**策略：

1. **不在启动时获取 Token**
   - 避免因过期凭证导致启动失败
   - 减少不必要的 API 调用

2. **请求到来时才获取**
   - 检查内存缓存
   - 检查文件缓存 (data/jwt/)
   - 如果都过期，才调用 OAuth2 API

3. **错误隔离**
   - 某个凭证过期只影响使用它的客户端
   - 其他客户端不受影响

## 故障转移

当配置了多个服务账号时，系统会自动故障转移：

1. 优先选择有**有效 Token** 的服务账号
2. 如果都没有有效 Token，根据**权重**选择
3. 如果选中的账号获取 Token 失败，返回错误（不自动切换）

## 配置示例

### 单服务账号客户端

```json
{
  "client_token": "gemini-client-key-aaaa",
  "enable": true,
  "key_filename_gemini": [
    {
      "key_filename": "hulaoban-202504.json",
      "key_weight": 1
    }
  ]
}
```

### 多服务账号客户端（负载均衡）

```json
{
  "client_token": "gemini-client-key-bbbb",
  "enable": true,
  "key_filename_gemini": [
    {
      "key_filename": "company-vertex-1.json",
      "key_weight": 2
    },
    {
      "key_filename": "company-vertex-2.json",
      "key_weight": 1
    }
  ]
}
```

### 多服务支持客户端

```json
{
  "client_token": "gemini-client-key-cccc",
  "enable": true,
  "key_filename_gemini": [
    {
      "key_filename": "gemini-account.json",
      "key_weight": 1
    }
  ],
  "key_filename_claude": [
    {
      "key_filename": "claude-account.json",
      "key_weight": 1
    }
  ]
}
```

注意：实际使用哪个服务由 `client_token` 的前缀决定。

## 迁移指南

### 从旧配置迁移

1. **备份旧配置文件**
   ```bash
   cp data/map/map-client.json data/map/map-client.json.bak
   cp data/map/map-client-json.json data/map/map-client-json.json.bak
   cp data/map/map-json-model-region.json data/map/map-json-model-region.json.bak
   ```

2. **创建新配置**
   - 参考 `map-config.json` 示例
   - 将旧配置内容合并到新结构

3. **更新客户端令牌**
   - 确保令牌有正确的前缀（gemini-, claude- 等）

4. **测试配置**
   ```bash
   ./test-new-config.sh
   ```

5. **重启服务**
   ```bash
   docker-compose restart api-proxy-nginx
   ```

## 故障排查

### 配置加载失败

检查日志：
```bash
docker-compose logs api-proxy-nginx | grep "Configuration"
```

常见问题：
- JSON 格式错误
- 缺少必需字段
- 文件路径错误

### Token 获取失败

检查：
1. 服务账号 JSON 文件是否存在
2. 服务账号是否过期
3. OAuth2 API 是否可访问

查看详细日志：
```bash
docker-compose logs -f api-proxy-nginx | grep "oauth_process"
```

### 模型不支持

确保：
1. 模型名称在 `key_filename_*[].models` 中配置
2. 客户端使用的服务账号包含该模型
3. 域名配置正确

## 优势

1. **统一管理**：所有配置在一个文件中
2. **灵活路由**：通过令牌前缀自动识别服务类型
3. **负载均衡**：支持权重配置
4. **故障隔离**：Lazy Loading 避免启动失败
5. **易于扩展**：添加新服务类型只需增加配置节
