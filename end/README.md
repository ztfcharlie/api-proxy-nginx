# OpenResty AI 代理服务

基于 OpenResty 的高性能 AI API 代理服务，支持 Google Vertex AI、Claude API 等多种 AI 服务，提供统一接口、OAuth2 认证、动态路由和隐私保护。

## 🚀 核心特性

### 认证与安全
- **多重 OAuth2 认证**: 自动管理和刷新 Google 服务账号 Token
- **客户端认证**: 基于 Bearer Token 的客户端身份验证
- **隐私保护**: 完全隐藏客户端 IP 和位置信息
- **SSL/TLS 支持**: HTTPS 通信加密

### 功能特性
- **动态路由**: 根据模型名称自动路由到对应的 AI 服务端点
- **多服务支持**: 支持 Google Gemini、Claude、Vertex AI 等多种 AI 服务
- **流式响应**: 同时支持流式和非流式 AI 响应
- **负载均衡**: 支持多服务账号负载均衡
- **智能缓存**: Token 缓存和自动刷新机制

### 性能优化
- **高性能架构**: 基于 OpenResty + Lua 的高性能架构
- **连接池**: 优化的上游连接管理
- **内存缓存**: 高效的内存缓存机制
- **异步处理**: 非阻塞 I/O 处理

## 📁 项目架构

```
D:\www\nginxzhuanfa\end\                    # 项目根目录
├── docker-compose.yml                      # Docker Compose 服务编排
├── Dockerfile                              # Docker 镜像构建文件
├── init.sh                                 # 项目初始化脚本
├── DEPLOYMENT.md                          # 部署指南
│
├── nginx/                                  # Nginx 配置
│   ├── nginx.conf                         # OpenResty 主配置
│   └── conf.d/
│       └── gemini-proxy.conf              # AI API 代理配置
│
├── lua/                                    # Lua 应用模块
│   ├── config.lua                         # 配置管理模块
│   ├── auth_manager.lua                   # OAuth2 认证管理
│   ├── stream_handler.lua                 # 流式请求处理
│   ├── utils.lua                          # 通用工具函数
│   ├── oauth2_client.lua                 # OAuth2 客户端实现
│   └── oauth2_providers.lua              # OAuth2 提供商配置
│
├── nodejs/                                 # Node.js OAuth2 模拟服务
│   ├── Dockerfile                         # Node.js 服务镜像
│   ├── docker-compose.yml                # Node.js 服务编排
│   ├── package.json                       # 项目依赖配置
│   ├── README.md                          # Node.js 服务文档
│   ├── .env.example                       # 环境变量模板
│   ├── pm2.config.js                     # PM2 进程管理
│   ├── server/                            # Node.js 后端服务
│   │   ├── app.js                        # Express 应用入口
│   │   ├── config/                       # 配置文件
│   │   ├── services/                     # 业务逻辑服务
│   │   ├── middleware/                   # Express 中间件
│   │   ├── routes/                       # API 路由
│   │   └── utils/                        # 工具函数
│   ├── client/                           # React 前端应用（可选）
│   ├── database/                         # 数据库相关文件
│   │   └── schema.sql                   # MySQL 数据库结构
│   └── scripts/                          # 部署脚本
│       └── start.sh                      # 服务启动脚本
│
├── database/                              # 数据库相关文件
│   ├── schema.sql                        # MySQL 数据库结构
│   └── data/                             # 数据库备份文件
│
├── config/                                # 应用配置文件
│   └── app_config.json                   # 应用运行时配置
│
├── data/                                  # 数据文件目录
│   ├── json/                             # AI 服务账号凭证
│   │   ├── hulaoban-202504.json          # Google 服务账号凭证
│   │   └── backup-vertex.json           # 备用凭证文件
│   ├── jwt/                              # OAuth2 Token 缓存
│   └── map/                              # 配置映射文件
│       ├── map-config.json               # 统一配置映射
│       └── map-client.json               # 客户端授权配置
│
├── logs/                                  # 日志文件目录
│   ├── access.log                       # 访问日志
│   ├── error.log                        # 错误日志
│   └── oauth2/                          # OAuth2 服务日志
│
├── redis/                                 # Redis 配置
│   └── redis.conf                       # Redis 配置文件
│
├── mysql-data/                            # MySQL 数据存储
│
├── tmp/                                   # 临时文件目录
│   └── oauth2/                           # OAuth2 临时文件
│
├── client/                                # 客户端文件目录
│   └── google_server_account/            # 服务账号文件存储
│
├── html/                                  # 静态文件目录
│   ├── index.html                       # 默认首页
│   └── error/                           # 错误页面
│       ├── 40x.json                    # 4xx 错误配置
│       └── 50x.json                    # 5xx 错误配置
│
├── scripts/                               # 管理脚本
│   ├── start-services.sh                # 启动服务脚本
│   ├── stop-services.sh                 # 停止服务脚本
│   └── check-services.sh                # 检查服务状态脚本
│
└── ssl/                                  # SSL 证书目录
```

## 🏗️ 系统架构

### 服务组件

1. **API 代理服务** (OpenResty + Nginx)
   - 接收客户端请求
   - OAuth2 认证和授权
   - 动态路由和负载均衡
   - 流式响应处理

2. **缓存服务** (Redis)
   - Token 缓存
   - 会话存储
   - 负载均衡状态

3. **AI 服务** (Google Vertex AI, Claude API)
   - 实际的 AI 模型推理
   - 多种模型支持
   - 流式和非流式响应

### 数据流架构

```
客户端请求 → [OpenResty 代理] → [认证模块] → [路由模块] → [AI 服务]
     ↓              ↓              ↓           ↓           ↓
  隐私头部移除 → 客户端验证 → Token 管理 → 动态路由 → AI 响应
     ↓              ↓              ↓           ↓           ↓
   日志记录 ← 访问控制 ← Token 缓存 ← 负载均衡 ← 流式处理
```

## 🛠️ 快速开始

### 环境要求

- Docker 和 Docker Compose
- Linux/macOS 环境 (Windows 需要 WSL2)
- 至少 4GB 可用内存
- 网络连接到 Google AI 服务

### 1. 一键部署（推荐）

```bash
# 进入项目目录
cd D:\www\nginxzhuanfa\end

# 创建 Docker 网络
docker network create api-proxy-network

# 启动 OAuth2 模拟服务
cd nodejs
docker-compose up -d

# 启动主代理服务
cd ..
docker-compose up -d

# 检查服务状态
docker-compose ps
```

### 2. 项目初始化

```bash
# 运行初始化脚本，创建必要目录
chmod +x init.sh
./init.sh

# 设置权限
chmod -R 755 data logs config redis-data mysql-data tmp/oauth2 client/google_server_account
```

### 3. 验证部署

```bash
# 健康检查
curl http://localhost:8888/health      # 主代理服务
curl http://localhost:8889/health      # OAuth2 模拟服务

# 测试 OAuth2 认证
curl -X POST http://localhost:8889/accounts.google.com/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=test&client_secret=test"
```

### 2. 配置 AI 服务账号

将 Google Cloud 服务账号 JSON 文件放入 `data/json/` 目录：

```bash
# 示例：复制服务账号文件
cp your-google-service-account.json data/json/hulaoban-202504.json
```

### 3. 配置客户端映射

#### 配置客户端授权 (`data/map/map-client.json`)
```json
{
  "gemini-client-key-001": "enable",
  "claude-client-key-002": "enable",
  "vertex-client-key-003": "disable"
}
```

#### 配置服务映射 (`data/map/map-config.json`)
```json
{
  "clients": [
    {
      "client_token": "gemini-client-key-001",
      "enable": true,
      "key_filename_gemini": ["hulaoban-202504.json"],
      "service_type": "gemini"
    },
    {
      "client_token": "claude-client-key-002",
      "enable": true,
      "key_filename_claude": ["backup-vertex.json"],
      "service_type": "claude"
    }
  ],
  "key_filename_gemini": [
    {
      "key_filename": "hulaoban-202504.json",
      "models": [
        {"model": "gemini-pro", "domain": "generativelanguage.googleapis.com"},
        {"model": "gemini-pro-vision", "domain": "generativelanguage.googleapis.com"},
        {"model": "gemini-embedding-001", "domain": "us-central1-aiplatform.googleapis.com"}
      ]
    }
  ],
  "key_filename_claude": [
    {
      "key_filename": "backup-vertex.json",
      "models": [
        {"model": "claude-3-opus", "domain": "api.anthropic.com"},
        {"model": "claude-3-sonnet", "domain": "api.anthropic.com"}
      ]
    }
  ]
}
```

### 4. 配置应用设置 (`config/app_config.json`)

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

### 5. 启动服务

```bash
# 使用 Docker Compose 启动所有服务
docker-compose up --build -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

## 📡 API 使用指南

### 认证方式

所有 API 请求都需要在 Header 中包含客户端 Token：

```http
Authorization: Bearer {client_token}
Content-Type: application/json
```

### 请求格式

#### Google Gemini API
```http
POST /v1/models/{model_name}:generateContent
Authorization: Bearer gemini-client-key-001
Content-Type: application/json

{
  "contents": [
    {"parts": [{"text": "Hello, AI!"}]}
  ]
}
```

#### 流式请求
```http
POST /v1/models/{model_name}:streamGenerateContent
Authorization: Bearer gemini-client-key-001
Content-Type: application/json
Accept: text/event-stream

{
  "contents": [
    {"parts": [{"text": "Write a story"}]}
  ],
  "stream": true
}
```

#### Claude API
```http
POST /v1/messages
Authorization: Bearer claude-client-key-002
Content-Type: application/json

{
  "model": "claude-3-sonnet",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "Hello, Claude!"}
  ]
}
```

### 响应格式

#### 标准响应
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {"text": "Hello! How can I help you today?"}
        ]
      }
    }
  ]
}
```

#### 流式响应
```text
data: {"candidates": [{"content": {"parts": [{"text": "Hello"}]}}]}

data: {"candidates": [{"content": {"parts": [{"text": "!"}]}}]}

data: [DONE]
```

## 🔧 管理与监控

### 服务管理命令

```bash
# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 重新构建并启动
docker-compose up --build -d

# 查看特定服务日志
docker-compose logs -f api-proxy-nginx
docker-compose logs -f api-proxy-redis

# 进入容器调试
docker-compose exec api-proxy-nginx /bin/sh
```

### 健康检查

```bash
# 服务健康状态
curl http://localhost:8888/health

# 服务状态信息
curl http://localhost:8888/status

# 配置验证
curl http://localhost:8888/config
```

### 日志监控

日志级别配置 (`config/app_config.json`):
- `debug`: 详细调试信息
- `info`: 一般操作信息 (推荐)
- `warn`: 警告信息
- `error`: 仅错误信息

```bash
# 实时查看日志
tail -f logs/access.log
tail -f logs/error.log

# 搜索特定客户端日志
grep "client-token" logs/access.log

# 查看认证错误
grep "OAuth2" logs/error.log
```

## 🔒 安全配置

### SSL/TLS 配置

1. 将 SSL 证书放入 `ssl/` 目录：
```bash
cp your-cert.pem ssl/cert.pem
cp your-key.pem ssl/key.pem
```

2. 配置 HTTPS (编辑 `nginx/conf.d/gemini-proxy.conf`)：
```nginx
server {
    listen 8443 ssl;
    ssl_certificate /usr/local/openresty/nginx/ssl/cert.pem;
    ssl_certificate_key /usr/local/openresty/nginx/ssl/key.pem;

    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
}
```

### 访问控制

系统自动移除以下隐私相关头部：
- `X-Forwarded-For`
- `X-Real-IP`
- `X-Client-IP`
- `X-Forwarded-Host`
- `X-Forwarded-Proto`
- `Via`
- `Referer`
- `User-Agent`

### 速率限制 (可选)

在 `nginx/conf.d/gemini-proxy.conf` 中添加：
```nginx
# 限制每个客户端每分钟最多 60 个请求
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=60r/m;

server {
    location / {
        limit_req zone=api_limit burst=10 nodelay;
        # ... 其他配置
    }
}
```

## 🚨 故障排除

### 常见问题及解决方案

#### 1. 服务启动失败
```bash
# 检查配置文件
docker-compose config

# 查看启动日志
docker-compose logs api-proxy-nginx

# 检查端口占用
netstat -tulpn | grep 8888
```

#### 2. OAuth2 认证失败
```bash
# 检查服务账号文件
ls -la data/json/

# 验证 JSON 格式
python3 -m json.tool data/json/hulaoban-202504.json

# 查看认证日志
grep "OAuth2" logs/error.log

# 清理 Token 缓存
rm -rf data/jwt/*
docker-compose restart api-proxy-nginx
```

#### 3. 客户端认证失败
```bash
# 检查客户端配置
cat data/map/map-client.json

# 验证客户端状态
curl -H "Authorization: Bearer your-client-token" \
     http://localhost:8888/status
```

#### 4. 模型不支持
```bash
# 检查模型映射配置
cat data/map/map-config.json | jq '.key_filename_gemini[].models'

# 验证模型名称拼写
curl -X POST http://localhost:8888/v1/models \
     -H "Authorization: Bearer client-token"
```

#### 5. 流式响应问题
- 确保请求包含 `Accept: text/event-stream` 头部
- 检查 URL 是否包含 `stream` 关键字
- 验证客户端是否支持 SSE (Server-Sent Events)

### 性能优化建议

#### Token 缓存优化
```json
{
  "token_refresh": {
    "interval": 3600,      // 延长刷新间隔
    "early_refresh": 600    // 提前刷新时间
  }
}
```

#### 连接池优化
```json
{
  "timeouts": {
    "proxy_read": 600,      // 增加读取超时
    "proxy_connect": 120,   // 增加连接超时
    "keepalive": 120        // 增加保持连接时间
  }
}
```

#### Redis 内存优化
```bash
# 编辑 docker-compose.yml Redis 配置
command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
```

## 🔧 开发指南

### 模块化测试

每个 Lua 模块都支持独立测试：

```bash
# 测试配置模块
docker-compose exec api-proxy-nginx lua -e "
local config = require 'config'
config.init()
print('Config loaded:', config.is_loaded())
print('Log level:', config.get_app_config().log_level)
"

# 测试认证模块
docker-compose exec api-proxy-nginx lua -e "
local auth = require 'auth_manager'
-- 添加测试代码
"
```

### 添加新的 AI 服务支持

1. 在 `lua/oauth2_providers.lua` 中添加新的提供商配置
2. 在 `data/map/map-config.json` 中添加模型映射
3. 更新 `lua/auth_manager.lua` 中的认证逻辑
4. 重启服务并测试

### 自定义中间件

在 `nginx/conf.d/gemini-proxy.conf` 中添加自定义 Lua 代码：

```nginx
location / {
    access_by_lua_block {
        -- 自定义认证逻辑
        local client_id = ngx.var.http_authorization

        -- 自定义限流逻辑
        local redis = require "resty.redis"
        -- ...
    }

    proxy_pass https://ai-service-endpoint;
}
```

## 📊 监控与统计

### 访问统计

系统自动记录：
- 请求时间戳
- 客户端标识
- 请求模型
- 响应状态码
- 处理时间

```bash
# 生成访问统计报告
awk '{print $1}' logs/access.log | sort | uniq -c | sort -nr

# 统计热门模型
grep "model=" logs/access.log | awk -F'model=' '{print $2}' | awk '{print $1}' | sort | uniq -c
```

### 性能监控

```bash
# 监控响应时间
awk '{print $NF}' logs/access.log | sort -n

# 监控错误率
grep -c " 5[0-9][0-9] " logs/access.log

# 监控并发连接
docker-compose exec api-proxy-nginx nginx -s status
```

## 📝 更新日志

### v1.0.0 (2024-12)
- 初始版本发布
- 支持 Google Gemini API
- OAuth2 认证实现
- 流式响应支持
- Docker 容器化部署

### 计划功能
- [ ] Claude API 完整支持
- [ ] 更多 AI 服务集成
- [ ] 请求限流和配额管理
- [ ] Web 管理界面
- [ ] 监控仪表板
- [ ] 多租户支持

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📞 技术支持

如需帮助，请通过以下方式获取支持：

1. 查阅本文档的故障排除部分
2. 检查项目 [Issues](https://github.com/your-repo/issues)
3. 查看系统日志文件中的错误信息
4. 联系技术支持团队

---

**注意**: 本代理服务会自动隐藏客户端的 IP 地址和位置信息，确保用户隐私安全。所有请求都通过代理服务器转发，AI 服务无法直接访问客户端信息。