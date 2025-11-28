# 🤖 Gemini API 代理服务器

一个功能完整的 Nginx + Lua 解决方案，用于转发和验证 Google Gemini API 请求，支持多个 API Key 轮询和智能故障转移。

## ✨ 功能特性

- 🔑 **多 API Key 支持** - 支持配置多个真实的 Gemini API Key 进行轮询
- 🔄 **智能轮询策略** - 支持 round_robin、random、weighted、least_used 策略
- ⚡ **自动故障转移** - 检测 Key 健康状态，自动切换到可用的 Key
- 🚦 **请求限流** - 基于 API Key 的请求频率限制
- 📊 **详细日志记录** - 可配置的请求和响应日志
- 🌐 **完全透传** - 支持流式和非流式 HTTP 请求
- 🏥 **健康检查** - 内置健康检查和监控端点
- 🐳 **容器化部署** - Docker Compose 一键部署

## 🏗️ 架构设计

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   客户端请求     │───▶│  api-proxy-nginx │───▶│ Google Gemini API  │
│                 │    │                  │    │                     │
│ • Client API Key │    │ • Key 验证      │    │ • 轮询的 Real Key   │
│ • API 请求       │    │ • 负载均衡      │    │ • 原始请求转发      │
└─────────────────┘    │ • 故障转移      │    └─────────────────────┘
                       │ • 限流控制      │
                       └──────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │ api-proxy-redis │  (可选缓存)
                       └──────────────────┘
```

## 🚀 快速开始

### 前置要求

- Docker 和 Docker Compose
- Google Gemini API Key（至少一个）

### 一键部署

```bash
# 1. 克隆项目
git clone https://github.com/ztfcharlie/api-proxy-nginx.git
cd api-proxy-nginx

# 2. 初始化项目
./init.sh

# 3. 配置 API Key
vim lua/config.lua

# 4. 启动服务
docker-compose up -d

# 5. 验证部署
curl http://localhost:8080/health
```

### 配置示例

```lua
-- lua/config.lua
-- 真实的 API Key 列表（支持轮询）
real_api_keys = {
    "YOUR_GEMINI_API_KEY_1",
    "YOUR_GEMINI_API_KEY_2",
    "YOUR_GEMINI_API_KEY_3",
},

-- Key 轮询策略配置
key_rotation = {
    strategy = "round_robin",  -- round_robin, random, weighted, least_used
    retry_on_failure = true,
    max_retries = 3,
},

-- 允许的客户端 API Key 列表
allowed_keys = {
    ["CLIENT_API_KEY_1"] = true,
    ["CLIENT_API_KEY_2"] = true,
},
```

## 📋 服务说明

| 服务名 | 镜像 | 端口 | 说明 |
|--------|------|------|------|
| api-proxy-nginx | nginx:1.26.1-stable | 8080, 8443 | Gemini API 代理服务 |
| api-proxy-redis | redis:7.2.4-alpine | 6379 | Redis 缓存服务（可选） |
| api-proxy-fluent | fluent/fluentd:v1.16-debian-1 | - | 日志聚合服务 |

## 🔧 配置说明

### API Key 轮询策略

1. **round_robin** (推荐): 按顺序循环使用 Key
2. **random**: 随机选择可用的 Key
3. **weighted**: 根据权重选择 Key（权重越高被选中概率越大）
4. **least_used**: 选择使用次数最少的 Key

### 故障转移机制

- 自动检测 Key 健康状态
- 连续失败 3 次的 Key 会被标记为不健康
- 自动切换到其他健康 Key
- 5 分钟后自动尝试恢复不健康的 Key
- 支持 429 错误处理和重试

### 限流配置

```lua
rate_limit = {
    requests_per_minute = 60,  -- 每个 key 每分钟最大请求数
    check_interval = 1,        -- 检查间隔
},
```

### 日志配置

```lua
logging = {
    log_request_body = true,   -- 是否记录请求体
    log_response_body = false,  -- 是否记录响应体
    log_file = "/var/log/nginx/gemini_proxy.log",
},
```

## 📡 API 使用

### 健康检查

```bash
# 服务健康状态
curl http://localhost:8080/health

# 服务状态信息
curl http://localhost:8080/status
```

### API 代理

```bash
curl "http://localhost:8080/v1beta/models/gemini-embedding-001:embedContent" \
  -H "x-goog-api-key: CLIENT_API_KEY_1" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "models/gemini-embedding-001",
    "content": {"parts":[{"text": "What is the meaning of life?"}]}
  }'
```

请求会被自动：
1. 验证客户端 API Key 是否在白名单中
2. 从轮询池中选择一个可用的真实 Key
3. 转发到 Google Gemini API
4. 记录详细日志和 Key 使用情况

## 🐳 Docker 部署

### 基础部署

```bash
# 启动核心服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f api-proxy-nginx
```

### 完整部署（包含日志服务）

```bash
# 启动所有服务
docker-compose --profile logging up -d

# 查看所有服务日志
docker-compose logs -f
```

### 管理命令

```bash
# 使用 Makefile
make up         # 启动服务
make down       # 停止服务
make logs       # 查看日志
make restart    # 重启服务
make test       # 测试服务
make shell      # 进入容器
make reload     # 重新加载配置
```

## 📊 监控和日志

### 日志格式

```json
{
  "timestamp": "2024-01-01 12:00:00",
  "remote_addr": "192.168.1.100",
  "request_method": "POST",
  "request_uri": "/v1beta/models/gemini-embedding-001:embedContent",
  "api_key": "CLIENT_API_KEY_1",
  "real_api_key_used": "YOUR_GEMINI_API_KEY_2",
  "request_time": "0.123",
  "status": "200",
  "upstream_status": "200"
}
```

### Key 状态监控

系统会实时监控每个 Key 的：
- 使用次数
- 成功次数
- 失败次数
- 连续失败次数
- 健康状态
- 最后使用时间

## 🔒 安全配置

### 生产环境建议

1. **使用强密码和安全的 API Key**
2. **启用 HTTPS**
   ```bash
   # 将 SSL 证书放入 ssl/ 目录
   cp your-cert.pem ssl/
   cp your-key.pem ssl/

   # 启用 HTTPS 端口
   docker-compose -f docker-compose.yaml -f docker-compose.https.yaml up -d
   ```
3. **限制访问来源 IP**
4. **定期备份配置和日志**
5. **监控异常请求模式**

### 环境变量配置

```bash
# .env 文件
GEMINI_API_KEYS=key1,key2,key3
KEY_ROTATION_STRATEGY=round_robin
KEY_MAX_RETRIES=3
REDIS_HOST=api-proxy-redis
REDIS_PORT=6379
```

## 🧪 测试

```bash
# 运行测试套件
make test

# 健康检查
curl http://localhost:8080/health

# API 测试
./test-api.sh

# 性能测试
./benchmark.sh
```

## 📁 项目结构

```
api-proxy-nginx/
├── docker-compose.yaml           # Docker Compose 配置
├── docker-compose.override.yaml  # 开发环境配置
├── nginx.conf                  # Nginx 主配置
├── conf.d/                     # Nginx 配置文件
│   ├── gemini-proxy.conf      # 主要代理配置
│   ├── gemini-proxy-common.conf # 共享配置
│   └── error-pages.html       # 错误页面
├── lua/                        # Lua 脚本
│   ├── config.lua             # 核心配置
│   ├── key_validator.lua      # Key 验证
│   ├── key_manager.lua       # Key 管理和轮询
│   ├── rate_limiter.lua     # 限流功能
│   ├── response_handler.lua  # 响应处理
│   └── logger.lua           # 日志记录
├── html/                       # 静态文件
│   └── index.html            # 管理界面
├── ssl/                        # SSL 证书目录
├── logs/                       # 日志文件
├── redis-data/                 # Redis 数据
├── fluentd/                    # Fluentd 配置
├── Makefile                    # 便捷管理脚本
├── init.sh                     # 项目初始化脚本
├── start.sh                    # 快速启动脚本
├── stop.sh                     # 快速停止脚本
├── QUICKSTART.md               # 快速开始指南
├── docker-deploy.md           # 部署文档
├── NETWORK-SUMMARY.md         # 网络配置说明
└── .env.example               # 环境变量示例
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发环境

```bash
# 克隆仓库
git clone https://github.com/ztfcharlie/api-proxy-nginx.git
cd api-proxy-nginx

# 初始化开发环境
./init.sh

# 启动开发服务
docker-compose -f docker-compose.yaml -f docker-compose.override.yaml up -d
```

### 代码规范

- Lua 代码遵循 Google Style Guide
- 提交前运行 `make test` 确保测试通过
- 提交信息遵循 Conventional Commits 规范

## 📝 更新日志

### v1.0.0 (2024-01-01)

- ✨ 新增多 API Key 轮询支持
- ✨ 新增智能故障转移机制
- ✨ 新增多种轮询策略
- ✨ 新增 Key 健康状态监控
- ✨ 新增详细日志记录
- 🐳 容器化部署支持
- 📚 完整文档和示例

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🆘 支持

如果遇到问题：

1. 查看 [FAQ](docs/faq.md)
2. 搜索 [Issues](https://github.com/ztfcharlie/api-proxy-nginx/issues)
3. 创建新的 [Issue](https://github.com/ztfcharlie/api-proxy-nginx/issues/new)
4. 联系维护者

## 🌟 Star History

如果这个项目对你有帮助，请给它一个 ⭐ Star！

---

**Made with ❤️ by [ztfcharlie](https://github.com/ztfcharlie)**