# 服务器部署指南

## 项目概述

这是一个基于 OpenResty 的 API 代理服务，用于转发请求到 Google Vertex AI API。

### 使用的 Lua 模块

项目使用了以下 Lua 模块：

1. **lua-cjson** - JSON 编码/解码（OpenResty 自带）
2. **lua-resty-http** - HTTP 客户端（需要安装）
3. **自定义模块**：
   - `config.lua` - 配置管理
   - `utils.lua` - 工具函数
   - `auth_manager.lua` - OAuth2 认证管理
   - `stream_handler.lua` - 流式请求处理

### 架构特点

- **Lazy Loading**: Token 按需获取，不在启动时预加载
- **多服务支持**: 通过 client_token 前缀识别服务类型（gemini-, claude-）
- **权重负载均衡**: 支持多个服务账号的权重分配
- **三级缓存**: 内存缓存 → 文件缓存 → OAuth2 API

## 部署前准备

### 1. 服务器要求

- **操作系统**: Linux (推荐 Ubuntu 20.04+ 或 CentOS 7+)
- **Docker**: 20.10+
- **Docker Compose**: 1.29+
- **内存**: 至少 2GB
- **磁盘**: 至少 10GB 可用空间
- **网络**: 能访问 Google OAuth2 API (https://oauth2.googleapis.com)

### 2. 检查 Docker 环境

```bash
# 检查 Docker 版本
docker --version

# 检查 Docker Compose 版本
docker compose --version

# 检查 Docker 是否运行
docker info
```

### 3. 准备配置文件

确保以下文件存在且配置正确：

```
end/
├── data/
│   ├── map/
│   │   └── map-config.json          # 统一配置文件（必需）
│   ├── json/
│   │   ├── hulaoban-202504.json     # Google 服务账号凭证
│   │   ├── company-vertex-1.json
│   │   └── ...
│   └── jwt/                          # Token 缓存目录（自动创建）
├── config/
│   └── app_config.json               # 应用配置（可选）
├── nginx/
│   ├── nginx.conf                    # Nginx 主配置
│   └── conf.d/
│       └── gemini-proxy.conf         # 代理配置
├── lua/                              # Lua 脚本
├── Dockerfile.new                    # 新的 Dockerfile
└── docker compose.new.yml            # 新的 docker compose 配置
```

## 部署步骤

### 步骤 1: 上传项目到服务器

```bash
# 在本地打包项目
cd D:\www\nginxzhuanfa
tar -czf end.tar.gz end/

# 上传到服务器（替换为你的服务器地址）
scp end.tar.gz user@your-server:/home/user/

# 在服务器上解压
ssh user@your-server
cd /home/user
tar -xzf end.tar.gz
cd end
```

### 步骤 2: 验证配置文件

```bash
# 检查配置文件是否存在
ls -la data/map/map-config.json
ls -la data/json/*.json
ls -la nginx/nginx.conf
ls -la nginx/conf.d/gemini-proxy.conf

# 验证 JSON 格式
cat data/map/map-config.json | jq .

# 如果没有 jq，可以用 python
python3 -m json.tool data/map/map-config.json
```

### 步骤 3: 创建必要的目录

```bash
# 创建日志和缓存目录
mkdir -p logs data/jwt redis-data

# 设置权限
chmod -R 755 data/jwt
chmod -R 755 logs
```

### 步骤 4: 构建和启动服务

```bash
# 使用新的配置文件
cp docker compose.new.yml docker compose.yml
cp Dockerfile.new Dockerfile

# 构建镜像
docker compose build

# 启动服务
docker compose up -d

# 查看启动日志
docker compose logs -f
```

### 步骤 5: 验证服务状态

```bash
# 等待 30-40 秒让服务完全启动

# 检查容器状态
docker compose ps

# 预期输出：
# NAME                  STATUS              PORTS
# api-proxy-nginx       Up (healthy)        0.0.0.0:8888->8080/tcp
# api-proxy-redis       Up (healthy)        0.0.0.0:6379->6379/tcp

# 检查健康状态
curl http://localhost:8888/health

# 预期输出：
# {"status":"ok","timestamp":1234567890,"version":"1.0.0"}

# 检查配置加载状态
curl http://localhost:8888/status

# 预期输出：
# {"status":"running","config_loaded":true,"timestamp":1234567890}
```

### 步骤 6: 测试 API 请求

```bash
# 测试启用的客户端
curl -X POST http://localhost:8888/v1/projects/test-project/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Hello, this is a test"
      }]
    }]
  }' \
  -v

# 查看日志
docker compose logs -f api-proxy-nginx | grep "oauth_process"
```

## 常用命令

### 服务管理

```bash
# 启动服务
docker compose up -d

# 停止服务
docker compose stop

# 重启服务
docker compose restart

# 停止并删除容器
docker compose down

# 查看日志
docker compose logs -f api-proxy-nginx

# 查看最近 100 行日志
docker compose logs --tail=100 api-proxy-nginx

# 进入容器
docker compose exec api-proxy-nginx sh
```

### 配置更新

```bash
# 修改配置后重启
docker compose restart api-proxy-nginx

# 如果修改了 Dockerfile，需要重新构建
docker compose build --no-cache
docker compose up -d
```

### 日志查看

```bash
# 查看 Nginx 访问日志
docker compose exec api-proxy-nginx tail -f /var/log/nginx/access.log

# 查看 Nginx 错误日志
docker compose exec api-proxy-nginx tail -f /var/log/nginx/error.log

# 查看配置加载日志
docker compose logs api-proxy-nginx | grep "Configuration"

# 查看 OAuth2 Token 获取日志
docker compose logs api-proxy-nginx | grep "oauth_process"
```

### 测试和调试

```bash
# 测试 Nginx 配置语法
docker compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -t

# 测试 Lua 模块加载
docker compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
    package.path = '/etc/nginx/lua/?.lua;' .. package.path
    local config = require 'config'
    config.init()
    print('Config loaded:', config.is_loaded())
"

# 查看 Token 缓存
ls -la data/jwt/

# 清空 Token 缓存（测试 Lazy Loading）
rm -f data/jwt/*.json
docker compose restart api-proxy-nginx
```

## 故障排查

### 问题 1: 容器无法启动

```bash
# 查看详细错误
docker compose logs api-proxy-nginx

# 常见原因：
# 1. 端口被占用
sudo netstat -tlnp | grep 8888

# 2. 配置文件语法错误
docker compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -t

# 3. 权限问题
ls -la data/
chmod -R 755 data/jwt
```

### 问题 2: 配置加载失败

```bash
# 检查配置文件
cat data/map/map-config.json | jq .

# 查看错误日志
docker compose logs api-proxy-nginx | grep -i "error\|cannot"

# 验证文件路径
docker compose exec api-proxy-nginx ls -la /etc/nginx/data/map/
```

### 问题 3: Token 获取失败

```bash
# 查看详细日志
docker compose logs api-proxy-nginx | grep "oauth"

# 检查服务账号文件
docker compose exec api-proxy-nginx cat /etc/nginx/data/json/hulaoban-202504.json | jq .

# 测试网络连接
docker compose exec api-proxy-nginx curl -v https://oauth2.googleapis.com/token
```

### 问题 4: 请求返回 403/500

```bash
# 查看请求日志
docker compose logs api-proxy-nginx | tail -50

# 检查客户端配置
docker compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
    package.path = '/etc/nginx/lua/?.lua;' .. package.path
    local config = require 'config'
    config.init()
    local client_config = config.get_client_config('gemini-client-key-aaaa')
    print('Client config:', require('cjson').encode(client_config))
"
```

## 性能优化

### 1. 调整 Worker 进程数

编辑 `nginx/nginx.conf`:

```nginx
worker_processes auto;  # 自动根据 CPU 核心数
```

### 2. 调整共享内存大小

```nginx
lua_shared_dict token_cache 50m;    # 增加 Token 缓存
lua_shared_dict rate_limit 10m;
```

### 3. 调整连接数

```nginx
events {
    worker_connections 2048;  # 增加连接数
}
```

### 4. 启用日志轮转

创建 `/etc/logrotate.d/nginx`:

```
/home/user/end/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 nobody nobody
    sharedscripts
    postrotate
        docker compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -s reopen
    endscript
}
```

## 安全建议

1. **限制端口访问**
   ```bash
   # 使用防火墙限制访问
   sudo ufw allow from 192.168.1.0/24 to any port 8888
   ```

2. **使用 HTTPS**
   - 配置 SSL 证书
   - 修改 `nginx/conf.d/gemini-proxy.conf` 启用 HTTPS

3. **定期更新**
   ```bash
   # 更新镜像
   docker compose pull
   docker compose up -d
   ```

4. **备份配置**
   ```bash
   # 定期备份
   tar -czf backup-$(date +%Y%m%d).tar.gz data/ config/
   ```

## 监控和告警

### 1. 健康检查

```bash
# 添加到 crontab
*/5 * * * * curl -f http://localhost:8888/health || echo "Service down" | mail -s "Alert" admin@example.com
```

### 2. 日志监控

```bash
# 监控错误日志
tail -f logs/error.log | grep -i "error\|fail"
```

### 3. 性能监控

```bash
# 查看容器资源使用
docker stats api-proxy-nginx api-proxy-redis
```

## 升级指南

### 升级配置

```bash
# 1. 备份当前配置
cp data/map/map-config.json data/map/map-config.json.bak

# 2. 更新配置文件
vim data/map/map-config.json

# 3. 验证配置
cat data/map/map-config.json | jq .

# 4. 重启服务
docker compose restart api-proxy-nginx
```

### 升级镜像

```bash
# 1. 停止服务
docker compose stop

# 2. 备份数据
tar -czf backup-$(date +%Y%m%d).tar.gz data/ logs/

# 3. 重新构建
docker compose build --no-cache

# 4. 启动服务
docker compose up -d

# 5. 验证
curl http://localhost:8888/health
```

## 联系支持

如有问题，请查看：
- 日志文件: `logs/error.log`
- 配置文档: `data/map/README-NEW-CONFIG.md`
- 测试清单: `TESTING_CHECKLIST.md`
