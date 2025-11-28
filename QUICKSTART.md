# 🚀 Gemini API 代理 - 快速开始

## 一键部署指南

### 前置要求
- Docker 和 Docker Compose 已安装
- 准备好您的 Gemini API Key

### 快速部署

#### 1. 克隆项目
```bash
git clone <repository-url>
cd nginxzhuanfa
```

#### 2. 一键初始化
```bash
# 自动创建所有目录并设置权限
./init.sh
```

#### 3. 配置API Key
```bash
# 编辑配置文件，设置您的真实API Key
vim lua/config.lua
```

配置示例：
```lua
-- 真实的API Key列表（支持轮询）
real_api_keys = {
    "YOUR_GEMINI_API_KEY_1",
    "YOUR_GEMINI_API_KEY_2",
    "YOUR_GEMINI_API_KEY_3",
},

-- 轮询策略
key_rotation = {
    strategy = "round_robin",  -- round_robin, random, weighted, least_used
    retry_on_failure = true,
    max_retries = 3,
},

-- 允许的客户端API Key
allowed_keys = {
    ["CLIENT_API_KEY_1"] = true,
    ["CLIENT_API_KEY_2"] = true,
},
```

#### 4. 启动服务
```bash
# 方法1：使用快速启动脚本
./start.sh

# 方法2：使用Docker Compose
docker-compose up -d

# 方法3：使用Makefile
make up
```

#### 5. 验证部署
```bash
# 检查服务状态
docker-compose ps

# 健康检查
curl http://localhost:8080/health

# 测试API请求
curl "http://localhost:8080/v1beta/models/gemini-embedding-001:embedContent" \
  -H "x-goog-api-key: CLIENT_API_KEY_1" \
  -H 'Content-Type: application/json' \
  -d '{"model": "models/gemini-embedding-001", "content": {"parts":[{"text": "Hello"}]}}'
```

### 🎉 完成！

访问地址：
- **代理服务**: http://localhost:8080
- **管理界面**: http://localhost:8080
- **健康检查**: http://localhost:8080/health
- **服务状态**: http://localhost:8080/status

### 常用命令
```bash
# 查看日志
make logs

# 重启服务
make restart

# 停止服务
make down

# 备份配置
make backup

# 测试服务
make test
```

## 🔧 高级配置

### 多Key轮询策略

1. **round_robin** (推荐): 按顺序循环使用Key
2. **random**: 随机选择可用的Key
3. **weighted**: 根据权重选择Key
4. **least_used**: 选择使用次数最少的Key

### 启用HTTPS
```bash
# 将SSL证书放入ssl目录
cp your-cert.pem ssl/
cp your-key.pem ssl/

# 修改端口映射
vim docker-compose.yaml
```

### 启用日志收集
```bash
# 启动完整服务（包含Fluentd）
docker-compose --profile logging up -d
```

## 📝 配置文件说明

- `lua/config.lua` - 核心配置，API Key和轮询策略
- `lua/key_manager.lua` - Key管理和轮询逻辑
- `lua/response_handler.lua` - 响应处理和故障转移
- `.env` - 环境变量配置
- `docker-compose.yaml` - Docker服务配置

## 🔍 故障排查

### 常见问题

1. **端口占用**
   ```bash
   # 检查端口
   netstat -tulpn | grep 8080
   # 修改docker-compose.yaml中的端口映射
   ```

2. **权限问题**
   ```bash
   # 重新运行初始化脚本
   ./init.sh --force
   ```

3. **Key配置错误**
   ```bash
   # 检查配置文件
   docker-compose exec nginx nginx -t
   ```

### 查看日志
```bash
# Nginx代理日志
docker-compose logs -f nginx

# 完整请求日志
tail -f logs/gemini_proxy.log

# Redis日志
docker-compose logs -f redis
```

### 重置项目
```bash
# 停止并清理
make clean

# 重新初始化
./init.sh --force

# 重新启动
make up
```

## 📚 更多文档

- [完整部署文档](docker-deploy.md)
- [配置说明](README.md)
- [Docker配置](docker-compose.yaml)
- [API文档](docs/api.md)

## 🆘 获取帮助

如果遇到问题：

1. 查看项目日志：`make logs`
2. 检查配置：`docker-compose exec nginx nginx -t`
3. 测试连接：`curl -v http://localhost:8080/health`
4. 重置项目：`make clean && ./init.sh && make up`

---

**注意**：生产环境部署时，请确保：
- 使用强密码和安全的 API Key
- 启用 HTTPS
- 定期备份配置和日志
- 监控服务状态和资源使用