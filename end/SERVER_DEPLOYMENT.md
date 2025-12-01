# 服务器快速部署指南

## 📦 准备工作

### 1. 在本地打包项目

```bash
# Windows 环境（使用 Git Bash 或 WSL）
cd D:\www\nginxzhuanfa
tar -czf end.tar.gz end/

# 或者使用 7-Zip 等工具压缩整个 end 目录
```

### 2. 上传到服务器

```bash
# 使用 SCP 上传
scp end.tar.gz user@your-server-ip:/home/user/

# 或使用 SFTP 工具（如 FileZilla, WinSCP）上传
```

## 🚀 服务器部署（三步完成）

### 步骤 1: 解压项目

```bash
# SSH 登录服务器
ssh user@your-server-ip

# 解压项目
cd /home/user
tar -xzf end.tar.gz
cd end

# 给脚本添加执行权限
chmod +x deploy.sh
```

### 步骤 2: 检查环境

```bash
# 运行环境检查
./deploy.sh check

# 预期输出：
# [SUCCESS] Docker 已安装
# [SUCCESS] Docker Compose 已安装
# [SUCCESS] Docker 服务正在运行
# [SUCCESS] ✓ data/map/map-config.json
# [SUCCESS] ✓ nginx/nginx.conf
# ...
# [SUCCESS] 环境检查完成！
```

### 步骤 3: 启动服务

```bash
# 一键启动（包含构建和启动）
./deploy.sh start

# 预期输出：
# [INFO] 检查部署环境...
# [INFO] 开始构建镜像...
# [INFO] 启动服务...
# [SUCCESS] 服务已启动！
```

## ✅ 验证部署

### 快速测试

```bash
# 运行自动测试
./deploy.sh test

# 预期输出：
# [SUCCESS] 健康检查通过
# [SUCCESS] 状态检查通过
# [SUCCESS] API 请求已转发
```

### 手动验证

```bash
# 1. 检查健康状态
curl http://localhost:8888/health

# 预期输出：
# {"status":"ok","timestamp":1234567890,"version":"1.0.0"}

# 2. 检查配置加载
curl http://localhost:8888/status

# 预期输出：
# {"status":"running","config_loaded":true,"timestamp":1234567890}

# 3. 查看容器状态
docker compose ps

# 预期输出：
# NAME                  STATUS              PORTS
# api-proxy-nginx       Up (healthy)        0.0.0.0:8888->8080/tcp
# api-proxy-redis       Up (healthy)        0.0.0.0:6379->6379/tcp
```

## 📋 常用命令

```bash
# 查看服务状态
./deploy.sh status

# 查看日志
./deploy.sh logs

# 重启服务
./deploy.sh restart

# 停止服务
./deploy.sh stop

# 查看帮助
./deploy.sh help
```

## 🔧 配置说明

### 核心配置文件

1. **data/map/map-config.json** - 统一配置文件
   - 客户端配置
   - 服务账号映射
   - 模型域名配置

2. **data/json/*.json** - Google 服务账号凭证
   - 需要有效的 Google Cloud 服务账号 JSON 文件

3. **nginx/nginx.conf** - Nginx 主配置
   - Lua 包路径
   - 共享内存配置
   - 日志格式

4. **nginx/conf.d/gemini-proxy.conf** - 代理配置
   - 路由规则
   - 认证逻辑
   - 请求转发

### 端口配置

- **8888**: HTTP API 端口（可在 docker compose.yml 中修改）
- **8443**: HTTPS 端口（可选）
- **6379**: Redis 端口（内部使用）

## 🐛 故障排查

### 问题 1: 容器无法启动

```bash
# 查看详细日志
docker compose logs api-proxy-nginx

# 检查端口占用
sudo netstat -tlnp | grep 8888

# 如果端口被占用，修改 docker compose.yml 中的端口映射
```

### 问题 2: 配置加载失败

```bash
# 验证 JSON 格式
cat data/map/map-config.json | jq .

# 查看配置加载日志
docker compose logs api-proxy-nginx | grep "Configuration"

# 检查文件权限
ls -la data/map/map-config.json
```

### 问题 3: API 请求返回 403

```bash
# 检查客户端配置
curl http://localhost:8888/status

# 查看认证日志
docker compose logs api-proxy-nginx | grep "client_token"

# 可能原因：
# - 客户端被禁用（enable: false）
# - 客户端不存在
# - Authorization 头格式错误
```

### 问题 4: Token 获取失败

```bash
# 查看 OAuth2 日志
docker compose logs api-proxy-nginx | grep "oauth"

# 检查服务账号文件
ls -la data/json/

# 测试网络连接
docker compose exec api-proxy-nginx curl -v https://oauth2.googleapis.com/token

# 可能原因：
# - 服务账号文件不存在
# - 服务账号已过期
# - 网络无法访问 Google API
```

## 📊 监控和维护

### 查看日志

```bash
# 实时日志
./deploy.sh logs

# 或直接使用 docker compose
docker compose logs -f --tail=100 api-proxy-nginx

# 查看错误日志
docker compose exec api-proxy-nginx tail -f /var/log/nginx/error.log
```

### 查看资源使用

```bash
# 查看容器资源
docker stats api-proxy-nginx api-proxy-redis

# 查看磁盘使用
du -sh data/ logs/
```

### 清理缓存

```bash
# 清理 Token 缓存（测试 Lazy Loading）
rm -f data/jwt/*.json
./deploy.sh restart

# 清理日志
rm -f logs/*.log
./deploy.sh restart
```

## 🔄 更新配置

### 更新 map-config.json

```bash
# 1. 编辑配置文件
vim data/map/map-config.json

# 2. 验证 JSON 格式
cat data/map/map-config.json | jq .

# 3. 重启服务
./deploy.sh restart

# 4. 验证配置加载
curl http://localhost:8888/status
```

### 更新服务账号

```bash
# 1. 上传新的服务账号文件到 data/json/
scp new-account.json user@server:/home/user/end/data/json/

# 2. 更新 map-config.json 中的配置

# 3. 重启服务
./deploy.sh restart
```

## 🔐 安全建议

### 1. 限制端口访问

```bash
# 使用防火墙限制访问
sudo ufw allow from 192.168.1.0/24 to any port 8888

# 或使用 iptables
sudo iptables -A INPUT -p tcp -s 192.168.1.0/24 --dport 8888 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8888 -j DROP
```

### 2. 保护敏感文件

```bash
# 限制服务账号文件权限
chmod 600 data/json/*.json

# 限制配置文件权限
chmod 600 data/map/map-config.json
```

### 3. 定期备份

```bash
# 创建备份脚本
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/user/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/end-backup-$DATE.tar.gz \
    data/map/ \
    data/json/ \
    config/ \
    --exclude='data/jwt/*'
# 保留最近 7 天的备份
find $BACKUP_DIR -name "end-backup-*.tar.gz" -mtime +7 -delete
EOF

chmod +x backup.sh

# 添加到 crontab（每天凌晨 2 点备份）
crontab -e
# 添加: 0 2 * * * /home/user/end/backup.sh
```

## 📈 性能优化

### 1. 调整 Worker 进程

编辑 `nginx/nginx.conf`:

```nginx
worker_processes auto;  # 根据 CPU 核心数自动调整
```

### 2. 增加缓存大小

```nginx
lua_shared_dict token_cache 50m;  # 增加到 50MB
```

### 3. 启用日志轮转

```bash
# 创建日志轮转配置
sudo vim /etc/logrotate.d/api-proxy

# 添加内容：
/home/user/end/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 nobody nobody
}
```

## 📞 获取帮助

### 查看文档

- **部署指南**: `DEPLOYMENT_GUIDE.md`
- **配置说明**: `data/map/README-NEW-CONFIG.md`
- **测试清单**: `TESTING_CHECKLIST.md`

### 查看日志

```bash
# 查看所有日志
./deploy.sh logs

# 查看特定日志
docker compose logs api-proxy-nginx | grep "ERROR"
```

### 运行测试

```bash
# 运行完整测试
./deploy.sh test

# 手动测试
./test-new-config.sh
```

## ✨ 快速参考

```bash
# 完整部署流程
./deploy.sh check    # 检查环境
./deploy.sh start    # 启动服务
./deploy.sh test     # 测试服务

# 日常维护
./deploy.sh status   # 查看状态
./deploy.sh logs     # 查看日志
./deploy.sh restart  # 重启服务

# 故障排查
docker compose ps                              # 查看容器状态
docker compose logs -f api-proxy-nginx         # 查看日志
curl http://localhost:8888/health              # 健康检查
curl http://localhost:8888/status              # 状态检查
```

---

**部署完成后，服务将在 http://your-server-ip:8888 上运行**

如有问题，请查看详细日志或参考 `DEPLOYMENT_GUIDE.md`
