# 部署前检查清单

## ✅ 上传到服务器前检查

### 1. 必需文件检查

确保以下文件存在：

```
□ Dockerfile.new
□ docker compose.new.yml
□ deploy.sh
□ nginx/nginx.conf
□ nginx/conf.d/gemini-proxy.conf
□ lua/config.lua
□ lua/utils.lua
□ lua/auth_manager.lua
□ lua/stream_handler.lua
□ data/map/map-config.json
□ data/json/*.json (至少一个服务账号文件)
```

### 2. 配置文件验证

```bash
# 验证 JSON 格式（Windows 使用 Git Bash 或 WSL）
cat data/map/map-config.json | jq .

# 或使用 Python
python -m json.tool data/map/map-config.json

# 检查服务账号文件
ls -la data/json/
```

### 3. 配置内容检查

打开 `data/map/map-config.json`，确认：

```
□ clients 数组至少有一个客户端
□ 每个客户端的 client_token 有正确的前缀（gemini-, claude-）
□ 每个客户端的 enable 字段设置正确
□ key_filename_gemini 或 key_filename_claude 配置正确
□ key_filename 对应的文件在 data/json/ 目录中存在
□ models 配置包含需要使用的模型
□ domain 配置正确
```

### 4. 打包项目

```bash
# 在项目根目录（D:\www\nginxzhuanfa）
cd D:\www\nginxzhuanfa

# 打包（使用 Git Bash 或 WSL）
tar -czf end.tar.gz end/

# 或使用 7-Zip（Windows）
# 右键 end 文件夹 -> 7-Zip -> 添加到压缩包 -> 选择 .tar.gz 格式

# 检查压缩包大小
ls -lh end.tar.gz
```

## 📤 上传到服务器

### 方法 1: 使用 SCP

```bash
# 上传压缩包
scp end.tar.gz user@your-server-ip:/home/user/

# 验证上传
ssh user@your-server-ip "ls -lh /home/user/end.tar.gz"
```

### 方法 2: 使用 SFTP 工具

- **FileZilla**: 图形界面，拖拽上传
- **WinSCP**: Windows 专用，支持 SCP/SFTP
- **MobaXterm**: 集成终端和文件传输

## 🖥️ 服务器环境检查

SSH 登录服务器后：

### 1. 检查 Docker

```bash
# 检查 Docker 版本
docker --version

# 预期: Docker version 20.10.0 或更高

# 检查 Docker 服务
sudo systemctl status docker

# 如果未运行，启动 Docker
sudo systemctl start docker
```

### 2. 检查 Docker Compose

```bash
# 检查版本
docker compose --version

# 预期: docker compose version 1.29.0 或更高
```

### 3. 检查网络连接

```bash
# 测试能否访问 Google API
curl -I https://oauth2.googleapis.com/token

# 预期: HTTP/2 200 或 405（方法不允许，但说明能连接）
```

### 4. 检查端口占用

```bash
# 检查 8888 端口
sudo netstat -tlnp | grep 8888

# 如果被占用，需要修改 docker compose.yml 中的端口映射
```

### 5. 检查磁盘空间

```bash
# 检查可用空间
df -h

# 预期: 至少 10GB 可用空间
```

## 🚀 部署步骤

### 1. 解压项目

```bash
cd /home/user
tar -xzf end.tar.gz
cd end
```

### 2. 验证文件

```bash
# 检查文件完整性
ls -la Dockerfile.new docker compose.new.yml deploy.sh
ls -la data/map/map-config.json
ls -la data/json/
```

### 3. 添加执行权限

```bash
chmod +x deploy.sh
chmod +x test-new-config.sh
chmod +x test_lua_modules.sh
```

### 4. 运行环境检查

```bash
./deploy.sh check
```

预期输出：
```
[SUCCESS] Docker 已安装
[SUCCESS] Docker Compose 已安装
[SUCCESS] Docker 服务正在运行
[SUCCESS] ✓ data/map/map-config.json
[SUCCESS] ✓ nginx/nginx.conf
...
[SUCCESS] 环境检查完成！
```

### 5. 启动服务

```bash
./deploy.sh start
```

预期输出：
```
[INFO] 检查部署环境...
[INFO] 开始构建镜像...
[INFO] 启动服务...
[SUCCESS] 服务已启动！
```

### 6. 验证部署

```bash
# 运行自动测试
./deploy.sh test

# 手动验证
curl http://localhost:8888/health
curl http://localhost:8888/status
```

## ✅ 部署成功标志

### 1. 容器状态

```bash
docker compose ps
```

预期输出：
```
NAME                  STATUS              PORTS
api-proxy-nginx       Up (healthy)        0.0.0.0:8888->8080/tcp
api-proxy-redis       Up (healthy)        0.0.0.0:6379->6379/tcp
```

### 2. 健康检查

```bash
curl http://localhost:8888/health
```

预期输出：
```json
{"status":"ok","timestamp":1234567890,"version":"1.0.0"}
```

### 3. 配置加载

```bash
curl http://localhost:8888/status
```

预期输出：
```json
{"status":"running","config_loaded":true,"timestamp":1234567890}
```

### 4. 日志检查

```bash
docker compose logs api-proxy-nginx | grep "Configuration"
```

预期输出：
```
[INFO] Configuration loaded successfully
```

## ❌ 常见问题

### 问题 1: Docker 未安装

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# CentOS
sudo yum install -y docker
sudo systemctl start docker
```

### 问题 2: Docker Compose 未安装

```bash
# 下载最新版本
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker compose

# 添加执行权限
sudo chmod +x /usr/local/bin/docker compose

# 验证
docker compose --version
```

### 问题 3: 权限不足

```bash
# 将当前用户添加到 docker 组
sudo usermod -aG docker $USER

# 重新登录或运行
newgrp docker

# 验证
docker ps
```

### 问题 4: 端口被占用

```bash
# 查看占用进程
sudo netstat -tlnp | grep 8888

# 停止占用进程或修改端口
vim docker compose.yml
# 修改: "8889:8080"  # 使用 8889 端口
```

### 问题 5: 网络无法访问 Google API

```bash
# 检查网络
ping 8.8.8.8

# 检查 DNS
nslookup oauth2.googleapis.com

# 如果需要代理，配置 Docker 代理
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo vim /etc/systemd/system/docker.service.d/http-proxy.conf

# 添加:
[Service]
Environment="HTTP_PROXY=http://proxy.example.com:8080"
Environment="HTTPS_PROXY=http://proxy.example.com:8080"

# 重启 Docker
sudo systemctl daemon-reload
sudo systemctl restart docker
```

## 📋 部署后验证清单

```
□ 容器状态为 Up (healthy)
□ 健康检查端点返回 200
□ 状态端点显示 config_loaded: true
□ 日志中显示 "Configuration loaded successfully"
□ 测试 API 请求能够转发（返回 200/400/401/403）
□ Token 缓存目录可写（data/jwt/）
□ 日志正常写入（logs/）
```

## 🎉 部署完成

如果所有检查都通过，恭喜！服务已成功部署。

### 下一步

1. **配置防火墙**（如果需要外部访问）
   ```bash
   sudo ufw allow 8888/tcp
   ```

2. **设置开机自启**
   ```bash
   # Docker 开机自启
   sudo systemctl enable docker

   # 容器自动重启（已在 docker compose.yml 中配置）
   ```

3. **配置监控**
   - 设置健康检查告警
   - 配置日志监控
   - 设置资源使用告警

4. **定期备份**
   - 备份配置文件
   - 备份服务账号文件

### 访问服务

```bash
# 本地访问
curl http://localhost:8888/health

# 远程访问（如果配置了防火墙）
curl http://your-server-ip:8888/health
```

---

**如有问题，请查看 `DEPLOYMENT_GUIDE.md` 或 `SERVER_DEPLOYMENT.md`**
