# API Proxy Service - Docker 部署指南

基于 OpenResty 的 Google Vertex AI API 代理服务，使用 Docker 容器化部署。

## 快速开始

### 1. 准备配置文件

确保以下目录和文件存在：

```bash
# 创建必要的目录
mkdir -p config data/json data/jwt data/map logs

# 配置文件会在首次启动时自动创建默认版本
```

### 2. 启动服务

```bash
# 基本服务（API Proxy + Redis）
docker-compose up -d

# 包含日志聚合服务
docker-compose --profile logging up -d

# 或使用脚本启动
./scripts/start-services.sh
./scripts/start-services.sh --with-logging
```

### 3. 检查服务状态

```bash
# 查看服务状态
docker-compose ps

# 健康检查
curl http://localhost:8080/health

# 或使用脚本检查
./scripts/check-services.sh
```

### 4. 停止服务

```bash
# 停止服务
docker-compose down

# 停止并清理数据卷
docker-compose down -v

# 或使用脚本
./scripts/stop-services.sh
./scripts/stop-services.sh --clean-volumes
```

## 服务架构

### 服务组件

- **api-proxy-nginx**: 主要的 API 代理服务（端口 8080, 8443）
- **redis**: 缓存和会话存储（端口 6379）
- **fluentd**: 日志聚合服务（可选，端口 24224）

### 网络配置

所有服务运行在 `api-proxy-network` 网络中，服务间可以通过服务名互相访问。

### 数据持久化

- `redis-data`: Redis 数据持久化
- `fluentd-data`: Fluentd 日志数据
- `./data`: 应用配置和缓存数据
- `./logs`: Nginx 日志文件

## 配置说明

### 环境变量

在 `.env` 文件中配置：

```bash
# Redis 配置
REDIS_PASSWORD=

# 日志配置
LOG_LEVEL=info
DEBUG_MODE=false

# 代理超时配置
PROXY_READ_TIMEOUT=300
PROXY_CONNECT_TIMEOUT=60

# 令牌刷新配置
TOKEN_REFRESH_INTERVAL=3000
TOKEN_EARLY_REFRESH=300
```

### 配置文件

#### 1. 应用配置 (`config/app_config.json`)
容器内路径: `/usr/local/openresty/nginx/config/app_config.json`

```json
{
    "log_level": "info",
    "debug_mode": false,
    "test_output": {
        "enabled": false,
        "request_headers": false,
        "oauth_process": false,
        "upstream_headers": false
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

#### 2. 客户端映射配置 (`data/map/map-config.json`)
容器内路径: `/usr/local/openresty/nginx/data/map/map-config.json`

```json
{
    "clients": [
        {
            "client_token": "your-client-token",
            "enable": true,
            "key_filename_gemini": [
                {
                    "key_filename": "service-account.json",
                    "key_weight": 1
                }
            ]
        }
    ],
    "key_filename_gemini": [
        {
            "key_filename": "service-account.json",
            "models": [
                {
                    "model": "gemini-pro",
                    "domain": "generativelanguage.googleapis.com"
                }
            ]
        }
    ]
}
```

#### 3. Google 服务账号凭证

将 Google Cloud 服务账号 JSON 文件放在 `data/json/` 目录中。
容器内路径: `/usr/local/openresty/nginx/data/json/`

## API 使用

### 健康检查

```bash
curl http://localhost:8080/health
```

### 状态检查

```bash
curl http://localhost:8080/status
```

### API 代理请求

```bash
curl -X POST http://localhost:8080/v1/projects/PROJECT_ID/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Authorization: Bearer your-client-token" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Hello, how are you?"
          }
        ]
      }
    ]
  }'
```

## 日志管理

### 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f api-proxy-nginx
docker-compose logs -f redis

# 查看最近的日志
docker-compose logs --tail=100 api-proxy-nginx
```

### 日志文件位置

- Nginx 访问日志: `./logs/access.log`
- Nginx 错误日志: `./logs/error.log`
- 应用日志: 通过 Docker 日志查看

## 故障排除

### 常见问题

1. **服务启动失败**
   ```bash
   # 检查配置文件语法
   docker-compose config

   # 查看详细错误日志
   docker-compose logs api-proxy-nginx
   ```

2. **Redis 连接失败**
   ```bash
   # 检查 Redis 服务状态
   docker-compose exec redis redis-cli ping

   # 检查网络连接
   docker-compose exec api-proxy-nginx nc -z redis 6379
   ```

3. **API 请求失败**
   ```bash
   # 检查配置文件
   cat data/map/map-config.json

   # 检查服务账号文件
   ls -la data/json/

   # 查看详细日志
   docker-compose logs -f api-proxy-nginx
   ```

### 调试模式

启用调试模式以获取更详细的日志：

1. 修改 `config/app_config.json`:
   ```json
   {
     "log_level": "debug",
     "debug_mode": true,
     "test_output": {
       "enabled": true,
       "request_headers": true,
       "oauth_process": true,
       "upstream_headers": true
     }
   }
   ```

2. 重启服务:
   ```bash
   docker-compose restart api-proxy-nginx
   ```

## 性能优化

### 资源限制

在 `docker-compose.yml` 中添加资源限制：

```yaml
services:
  api-proxy-nginx:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 扩展部署

```bash
# 扩展 API 代理服务实例
docker-compose up -d --scale api-proxy-nginx=3

# 使用负载均衡器（如 Nginx）分发请求
```

## 安全注意事项

1. **保护服务账号文件**: 确保 `data/json/` 目录权限正确
2. **使用 HTTPS**: 在生产环境中启用 SSL/TLS
3. **网络安全**: 限制容器网络访问
4. **定期更新**: 保持镜像和依赖更新

## 监控和维护

### 健康检查

服务包含内置的健康检查，Docker 会自动监控服务状态。

### 日志轮转

配置日志轮转以防止日志文件过大：

```bash
# 在宿主机上配置 logrotate
sudo vim /etc/logrotate.d/api-proxy
```

### 备份

定期备份重要数据：

```bash
# 备份配置和数据
tar -czf backup-$(date +%Y%m%d).tar.gz config/ data/

# 备份 Redis 数据
docker-compose exec redis redis-cli BGSAVE
```