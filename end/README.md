# OpenResty API Proxy Service

基于 OpenResty 的 Google Vertex AI API 代理服务，提供 OAuth2 认证、动态路由、隐私保护和流式请求支持。

## 🚀 功能特性

- **OAuth2 认证管理**: 自动获取和刷新 Google 服务账号 Token
- **客户端认证**: 基于 Bearer Token 的客户端身份验证
- **动态路由**: 根据模型名称自动路由到对应的 API 端点
- **隐私保护**: 完全隐藏客户端 IP 和位置信息
- **流式支持**: 同时支持流式和非流式请求处理
- **高性能**: 基于 OpenResty 和 Lua 的高性能架构
- **容器化部署**: Docker Compose 一键部署

## 📁 项目结构

```
D:\www\nginxzhuanfa\end\
├── docker-compose.yml          # Docker Compose 配置
├── Dockerfile                  # Docker 镜像构建
├── start.sh                   # 启动脚本
├── nginx/
│   ├── nginx.conf             # 主 Nginx 配置
│   └── conf.d/
│       └── gemini-proxy.conf  # 代理配置
├── lua/                       # Lua 模块
│   ├── config.lua            # 配置管理
│   ├── auth_manager.lua      # 认证管理
│   ├── stream_handler.lua    # 流式处理
│   └── utils.lua             # 工具函数
├── config/
│   └── app_config.json       # 应用配置
├── data/
│   ├── json/                 # Google 服务账号凭证
│   ├── jwt/                  # OAuth2 Token 缓存
│   └── map/                  # 配置映射文件
│       ├── map-client.json           # 客户端授权
│       ├── map-client-json.json      # 客户端到凭证映射
│       └── map-json-model-region.json # 模型到 API 端点映射
├── html/                     # 静态文件
├── logs/                     # 日志文件
└── ssl/                      # SSL 证书
```

## 🛠️ 部署指南

### 前置要求

- Docker 和 Docker Compose
- Google Cloud 服务账号凭证
- Linux/macOS 环境（Windows 需要 WSL）

### 1. 准备服务账号凭证

将 Google Cloud 服务账号 JSON 文件放入 `data/json/` 目录：

```bash
# 示例
cp your-service-account.json data/json/hulaoban-202504.json
```

### 2. 配置客户端映射

编辑 `data/map/map-client.json` 设置客户端授权：

```json
{
  "client-key-aaaa": "enable",
  "client-key-bbbb": "disable",
  "client-key-cccc": "enable"
}
```

编辑 `data/map/map-client-json.json` 设置客户端到服务账号的映射：

```json
{
  "client-key-aaaa": "hulaoban-202504.json",
  "client-key-bbbb": "hulaoban-202504.json",
  "client-key-cccc": "hulaoban-202504.json"
}
```

编辑 `data/map/map-json-model-region.json` 设置模型到 API 端点的映射：

```json
{
  "hulaoban-202504.json": {
    "gemini-embedding-001": "us-central1-aiplatform.googleapis.com",
    "gemini-2.5-pro": "aiplatform.googleapis.com",
    "gemini-3-pro-preview": "aiplatform.googleapis.com",
    "gemini-pro": "aiplatform.googleapis.com",
    "text-bison": "us-central1-aiplatform.googleapis.com"
  }
}
```

### 3. 配置应用设置

编辑 `config/app_config.json`：

```json
{
  "log_level": "info",
  "debug_mode": false,
  "test_output": {
    "enabled": true,
    "request_headers": true,
    "oauth_process": true,
    "upstream_headers": true
  },
  "token_refresh": {
    "interval": 3000,
    "early_refresh": 300
  },
  "timeouts": {
    "proxy_read": 300,
    "proxy_connect": 60,
    "keepalive": 65
  }
}
```

### 4. 启动服务

使用提供的启动脚本：

```bash
./start.sh
```

或手动启动：

```bash
# 构建并启动所有服务
docker-compose up --build -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 5. 验证部署

```bash
# 健康检查
curl http://localhost:8080/health

# 服务状态
curl http://localhost:8080/status

# 测试 API 代理（需要有效的客户端 ID）
curl -X POST http://localhost:8080/v1/projects/your-project/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Authorization: Bearer client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "Hello, world!"}]}]}'
```

## 🔧 使用说明

### API 请求格式

**基本格式:**
```
POST /v1/projects/{project_id}/locations/{location}/publishers/google/models/{model_name}:{operation}
Authorization: Bearer {client_id}
Content-Type: application/json
```

**非流式请求示例:**
```bash
curl -X POST http://localhost:8080/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Authorization: Bearer client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Explain quantum computing"}]}]
  }'
```

**流式请求示例:**
```bash
curl -X POST http://localhost:8080/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-pro:streamGenerateContent \
  -H "Authorization: Bearer client-key-aaaa" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "contents": [{"parts": [{"text": "Write a story"}]}],
    "stream": true
  }'
```

### 认证流程

1. **客户端发送请求**: 使用 `Authorization: Bearer {client-id}` 头部
2. **服务端验证**: 检查客户端 ID 是否在授权列表中
3. **映射服务账号**: 根据客户端 ID 找到对应的 Google 服务账号
4. **获取 OAuth2 Token**: 使用服务账号凭证获取 Google API Token
5. **转发请求**: 将客户端 Token 替换为 Google Token 并转发请求

### 隐私保护

服务会自动移除以下可能泄露客户端信息的头部：
- X-Forwarded-For
- X-Real-IP
- X-Client-IP
- X-Forwarded-Host
- X-Forwarded-Proto
- Via
- Referer
- Origin
- User-Agent

## 📊 监控和日志

### 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f api-proxy-nginx
docker-compose logs -f api-proxy-redis

# 查看最近的日志
docker-compose logs --tail=100 api-proxy-nginx
```

### 日志级别

在 `config/app_config.json` 中配置：
- `debug`: 最详细的调试信息
- `info`: 一般操作信息
- `warn`: 警告信息
- `error`: 错误信息

### 测试输出

开发和调试时可以启用测试输出：

```json
{
  "test_output": {
    "enabled": true,
    "request_headers": true,
    "oauth_process": true,
    "upstream_headers": true
  }
}
```

## 🔧 管理操作

### 重启服务

```bash
docker-compose restart
```

### 停止服务

```bash
docker-compose down
```

### 更新配置

修改配置文件后重启服务：

```bash
docker-compose restart api-proxy-nginx
```

### 清理缓存

```bash
# 清理 Token 缓存
rm -rf data/jwt/*

# 重启服务以重新获取 Token
docker-compose restart api-proxy-nginx
```

### 添加新客户端

1. 在 `data/map/map-client.json` 中添加客户端 ID
2. 在 `data/map/map-client-json.json` 中设置映射关系
3. 重启服务

### 添加新模型支持

1. 在 `data/map/map-json-model-region.json` 中添加模型映射
2. 重启服务

## 🚨 故障排除

### 常见问题

**1. 服务启动失败**
```bash
# 检查日志
docker-compose logs api-proxy-nginx

# 检查配置文件语法
docker-compose config
```

**2. 认证失败**
- 检查客户端 ID 是否在 `map-client.json` 中
- 检查服务账号凭证文件是否存在
- 查看认证相关日志

**3. 模型不支持**
- 检查 `map-json-model-region.json` 中是否有对应映射
- 确认模型名称拼写正确

**4. 流式请求问题**
- 检查请求头部是否包含 `Accept: text/event-stream`
- 确认 URL 包含 `stream` 关键字
- 查看流式处理日志

### 性能优化

**1. Token 缓存优化**
- 调整 `token_refresh.early_refresh` 参数
- 监控 Token 刷新频率

**2. 连接池优化**
- 调整 `timeouts` 配置
- 监控连接使用情况

**3. 日志优化**
- 生产环境关闭 `test_output`
- 调整 `log_level` 为 `warn` 或 `error`

## 📝 开发指南

### 模块化测试

每个 Lua 模块都支持独立测试：

```bash
# 测试配置模块
docker-compose exec api-proxy-nginx lua -e "
local config = require 'config'
config.init()
print('Config loaded:', config.is_loaded())
"

# 测试认证模块
docker-compose exec api-proxy-nginx lua -e "
local auth = require 'auth_manager'
-- 测试代码
"
```

### 添加新功能

1. 在对应的 Lua 模块中添加功能
2. 更新配置文件（如需要）
3. 重启服务测试
4. 更新文档

## 📄 许可证

本项目采用 MIT 许可证。详见 LICENSE 文件。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 支持

如有问题，请查看：
1. 本文档的故障排除部分
2. 项目 Issues
3. 日志文件中的错误信息