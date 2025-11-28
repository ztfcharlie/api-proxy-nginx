# Docker 部署指南

## 🐳 快速开始

### 1. 初始化项目

```bash
# 克隆或下载项目文件到本地
cd nginxzhuanfa

# 运行初始化脚本（创建目录并设置权限）
./init.sh

# 或者使用 Makefile
make init
```

初始化脚本会自动创建以下目录并设置777权限：
- `conf.d/` - Nginx配置文件
- `lua/` - Lua脚本文件
- `logs/` - 日志文件存储
- `logs/processed/` - 处理后的日志
- `html/` - HTML静态文件
- `ssl/` - SSL证书文件
- `redis-data/` - Redis数据存储
- `fluentd/` - Fluentd配置文件
- `backups/` - 备份文件
- `temp/` - 临时文件

### 2. 配置项目

```bash
# 1. 编辑Lua配置文件
# 配置多个真实的Gemini API Key和轮询策略
vim lua/config.lua

# 2. 编辑环境配置文件
# 配置客户端API Key和其他环境变量
vim .env

# 3. （可选）配置SSL证书
# 将证书文件放入 ssl/ 目录
cp your-cert.pem ssl/
cp your-key.pem ssl/
```

### 3. 启动服务

```bash
# 方法1：使用快速启动脚本
./start.sh

# 方法2：使用Docker Compose
docker-compose up -d

# 方法3：使用Makefile
make up

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f api-proxy-nginx
```

### 4. 完整部署（包含日志服务）

```bash
# 启动所有服务（包括日志收集）
docker-compose --profile logging up -d

# 查看所有服务状态
docker-compose ps
```

## 📋 服务说明

### 主要服务

| 服务名 | 镜像 | 容器名 | 端口 | 说明 |
|--------|------|--------|------|------|
| api-proxy-nginx | nginx:1.26.1-stable | api-proxy-nginx | 8080, 8443 | Gemini API 代理服务 |
| api-proxy-redis | redis:7.2.4-alpine | api-proxy-redis | 6379 | Redis 缓存服务（可选） |

### 可选服务

| 服务名 | 镜像 | 容器名 | 说明 | 启动方式 |
|--------|------|--------|------|----------|
| api-proxy-fluent | fluent/fluentd:v1.16-debian-1 | api-proxy-fluent | 日志聚合服务 | `--profile logging` |

## ⚙️ 配置说明

### 1. 修改 API Key 配置

编辑 `lua/config.lua` 文件：

```lua
-- 设置真实的 API Key 列表（支持轮询）
real_api_keys = {
    "YOUR_GEMINI_API_KEY_1",
    "YOUR_GEMINI_API_KEY_2",
    "YOUR_GEMINI_API_KEY_3",
    -- 可以添加更多真实key
},

-- Key轮询策略配置
key_rotation = {
    strategy = "round_robin",  -- round_robin, random, weighted, least_used
    weights = {
        "YOUR_GEMINI_API_KEY_1" = 1,
        "YOUR_GEMINI_API_KEY_2" = 1,
        "YOUR_GEMINI_API_KEY_3" = 1,
    },
    retry_on_failure = true,
    max_retries = 3,
},

-- 允许的客户端 API Key 列表
allowed_keys = {
    ["YOUR_CLIENT_API_KEY_1"] = true,
    ["YOUR_CLIENT_API_KEY_2"] = true,
    ["YOUR_CLIENT_API_KEY_3"] = true,
},

-- 限流配置
rate_limit = {
    requests_per_minute = 60,  -- 调整限流值
},
```

### 2. 使用环境变量配置

复制并编辑环境配置文件：

```bash
cp .env.example .env
# 编辑 .env 文件
```

### 3. 日志配置

```lua
-- 日志配置
logging = {
    log_request_body = true,   -- 生产环境建议设为 false
    log_response_body = false,  -- 生产环境建议设为 false
    log_file = "/var/log/nginx/gemini_proxy.log",
},
```

### 4. 端口映射

如需修改端口，编辑 `docker-compose.yaml`：

```yaml
services:
  nginx:
    ports:
      - "你的端口:8080"    # HTTP 端口
      - "你的端口:8443"   # HTTPS 端口
```

## 🚀 使用方法

### 1. 健康检查

```bash
curl http://localhost:8080/health
# 返回: OK
```

### 2. API 测试

```bash
curl "http://localhost:8080/v1beta/models/gemini-embedding-001:embedContent" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "models/gemini-embedding-001",
    "content": {"parts":[{"text": "What is the meaning of life?"}]}
  }'
```

### 3. 查看日志

```bash
# 实时查看 Nginx 日志
docker-compose logs -f api-proxy-nginx

# 查看特定时间段日志
docker-compose logs --since="2024-01-01T00:00:00" api-proxy-nginx

# 查看日志文件内容
docker-compose exec api-proxy-nginx tail -f /var/log/nginx/gemini_proxy.log
```

## 🔧 管理命令

### 服务管理

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart nginx

# 重新加载配置
docker-compose exec api-proxy-nginx nginx -s reload

# 测试配置
docker-compose exec api-proxy-nginx nginx -t
```

### 日志管理

```bash
# 查看日志文件
docker-compose exec api-proxy-nginx ls -la /var/log/nginx/

# 清理日志文件
docker-compose exec api-proxy-nginx rm /var/log/nginx/gemini_proxy.log

# 重新创建日志文件
docker-compose exec api-proxy-nginx touch /var/log/nginx/gemini_proxy.log
```

## 📊 监控

### 1. 健康状态

```bash
# Nginx 健康检查
curl http://localhost:8080/health

# 服务状态
curl http://localhost:8080/status

# Docker 容器状态
docker-compose ps
```

### 2. 资源监控

```bash
# 查看容器资源使用情况
docker stats

# 查看特定服务
docker-compose exec api-proxy-nginx top
```

## 🔒 安全配置

### 1. HTTPS 支持

如果需要 HTTPS，请准备 SSL 证书：

```bash
# 将证书文件放入 ssl/ 目录
mkdir ssl
cp your-cert.pem ssl/
cp your-key.pem ssl/

# 修改 docker-compose.yaml 挂载证书
volumes:
  - ./ssl:/etc/nginx/ssl:ro
```

### 2. 网络安全

```bash
# 查看网络配置
docker network ls

# 限制外部访问 Redis（默认已限制）
# Redis 只暴露给容器内部网络
```

## 🐛 故障排查

### 1. 常见问题

**服务无法启动：**
```bash
# 检查端口占用
netstat -tulpn | grep 8080

# 检查配置文件
docker-compose config
```

**API 验证失败：**
```bash
# 检查配置文件
docker-compose exec api-proxy-nginx cat /etc/nginx/lua/config.lua

# 查看详细错误日志
docker-compose exec api-proxy-nginx tail -f /var/log/nginx/error.log
```

**限流问题：**
```bash
# 检查 Redis 连接（如果使用）
docker-compose exec redis redis-cli ping
```

### 2. 调试模式

```bash
# 进入容器调试
docker-compose exec api-proxy-nginx /bin/bash

# 测试 Lua 脚本
docker-compose exec api-proxy-nginx lua5.1 /etc/nginx/lua/config.lua
```

## 📦 备份与恢复

### 1. 配置备份

```bash
# 备份配置文件
tar -czf gemini-proxy-config-$(date +%Y%m%d).tar.gz nginx.conf conf.d/ lua/

# 备份日志
tar -czf gemini-proxy-logs-$(date +%Y%m%d).tar.gz logs/
```

### 2. 数据恢复

```bash
# 恢复配置
tar -xzf gemini-proxy-config-YYYYMMDD.tar.gz

# 重启服务
docker-compose restart
```

## 🔄 更新升级

### 1. 更新镜像

```bash
# 拉取最新镜像
docker-compose pull

# 重新创建容器
docker-compose up -d --force-recreate
```

### 2. 配置更新

```bash
# 修改配置后重新加载
docker-compose exec api-proxy-nginx nginx -s reload

# 或者重启服务
docker-compose restart nginx
```

## 📞 支持

如果遇到问题：

1. 查看日志：`docker-compose logs -f`
2. 检查配置：`docker-compose exec api-proxy-nginx nginx -t`
3. 测试连接：`curl -v http://localhost:8080/health`

---

**注意**：生产环境部署时，请确保：
- 使用强密码和安全的 API Key
- 启用 HTTPS
- 定期备份配置和日志
- 监控服务状态和资源使用