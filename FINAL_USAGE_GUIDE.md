# ✅ Gemini API 代理 - 最终使用指南

## 🎯 配置完成状态

经过全面检查和修复，所有配置现已正确完成：

### ✅ 已修复的问题：

1. **Docker镜像**：使用 `openresty/openresty:alpine` 支持Lua模块
2. **环境变量**：完整支持 `.env` 文件配置
3. **路径配置**：所有文件路径已对齐OpenResty结构
4. **Lua代码**：支持动态读取环境变量
5. **Docker Compose**：配置语法正确，包含所有必要的volumes

## 🚀 快速开始

### 1. 配置真实的API密钥

编辑 `.env` 文件，替换以下内容：

```bash
# 替换为你的真实Gemini API密钥
GEMINI_API_KEYS=your_real_gemini_key_1,your_real_gemini_key_2,your_real_gemini_key_3

# 设置客户端访问密钥
GEMINI_API_KEYS_OLD=client_key_1,client_key_2,client_key_3
```

### 2. 启动服务

```bash
# 构建并启动所有服务
docker-compose up -d --build

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f api-proxy-nginx
```

### 3. 验证服务

```bash
# 健康检查
curl http://localhost:8888/health

# 查看Nginx状态
curl http://localhost:8888/status

# 测试API代理
curl -X POST "http://localhost:8888/v1beta/models/gemini-pro:generateContent" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: client_key_1" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Hello, world!"
      }]
    }]
  }'
```

## 📁 项目结构

```
nginxzhuanfa/
├── .env                          # 环境变量配置 ⭐
├── Dockerfile                     # OpenResty镜像构建配置
├── docker-compose.yaml            # Docker Compose配置
├── nginx.conf                    # Nginx主配置
├── conf.d/                      # Nginx站点配置
│   └── gemini-proxy.conf         # Gemini API代理配置
├── lua/                          # Lua脚本文件
│   ├── config.lua                # 配置管理（支持环境变量）⭐
│   ├── key_manager.lua           # API密钥管理
│   ├── key_validator.lua         # 密钥验证
│   ├── rate_limiter.lua         # 限流功能
│   ├── logger.lua               # 日志记录
│   └── response_handler.lua     # 响应处理
├── html/                         # 静态文件
├── logs/                         # 日志目录
└── ssl/                          # SSL证书（可选）
```

## ⚙️ 环境变量说明

### 必须配置：

| 变量名 | 说明 | 示例值 |
|---------|------|--------|
| `GEMINI_API_KEYS` | 真实的Gemini API密钥 | `AIzaSy...,AIzaSy...,AIzaSy...` |
| `GEMINI_API_KEYS_OLD` | 客户端访问密钥 | `client_key_1,client_key_2` |

### 可选配置：

| 变量名 | 说明 | 默认值 |
|---------|------|--------|
| `KEY_ROTATION_STRATEGY` | 密钥轮询策略 | `round_robin` |
| `RATE_LIMIT_REQUESTS_PER_MINUTE` | 每分钟请求限制 | `60` |
| `KEY_MAX_RETRIES` | 最大重试次数 | `3` |
| `LOG_REQUEST_BODY` | 是否记录请求体 | `true` |
| `HTTP_PORT` | 容器内端口 | `8080` |
| `HTTPS_PORT` | HTTPS端口 | `8443` |

## 🔧 端口映射

| 容器内端口 | 外部端口 | 说明 |
|------------|----------|------|
| `8080` | `8888` | HTTP API代理 |
| `8443` | `8443` | HTTPS API代理 |
| `6379` | `6379` | Redis服务 |

## 🛡️ 安全建议

1. **保护 `.env` 文件**：确保不会被提交到版本控制
   ```bash
   echo ".env" >> .gitignore
   ```

2. **使用强密钥**：为客户端访问设置复杂的密钥
   ```bash
   # 使用随机生成的长字符串
   openssl rand -hex 16
   ```

3. **监控日志**：定期检查访问日志和错误
   ```bash
   # 查看Nginx日志
   docker-compose logs api-proxy-nginx
   ```

## 🔍 故障排除

### 常见问题：

1. **启动失败**：
   ```bash
   # 查看详细错误日志
   docker-compose logs api-proxy-nginx

   # 检查配置文件语法
   docker-compose config
   ```

2. **API密钥无效**：
   - 确认 `.env` 中的 `GEMINI_API_KEYS` 是真实的Gemini API密钥
   - 检查密钥是否在Google Cloud Console中启用

3. **客户端访问被拒绝**：
   - 确认使用的是 `GEMINI_API_KEYS_OLD` 中配置的密钥
   - 检查密钥拼写是否正确

4. **限流问题**：
   ```bash
   # 调整限流参数后重启服务
   # 编辑 .env 文件
   docker-compose restart api-proxy-nginx
   ```

## 📊 监控和管理

### 查看服务状态：
```bash
# 所有服务状态
docker-compose ps

# 实时日志
docker-compose logs -f

# 资源使用情况
docker stats
```

### 重启服务：
```bash
# 重启Nginx服务
docker-compose restart api-proxy-nginx

# 重启所有服务
docker-compose restart
```

### 更新配置：
```bash
# 1. 编辑 .env 文件
# 2. 重新构建并启动
docker-compose up -d --build
```

## 🔄 维护操作

### 日常维护：

1. **日志轮转**：定期清理旧的日志文件
2. **监控配额**：跟踪API使用量
3. **密钥轮换**：定期更新API密钥
4. **性能优化**：根据负载调整配置

### 备份重要配置：
```bash
# 备份环境变量
cp .env .env.backup.$(date +%Y%m%d)

# 备份配置文件
tar -czf config-backup-$(date +%Y%m%d).tar.gz \
    docker-compose.yaml Dockerfile nginx.conf conf.d/ lua/
```

## ✅ 验证清单

启动服务后，确认以下功能正常：

- [ ] 服务启动成功 (`docker-compose ps`)
- [ ] 健康检查通过 (`curl http://localhost:8888/health`)
- [ ] 客户端密钥验证正常
- [ ] API密钥轮询工作
- [ ] 限流功能正常
- [ ] 日志记录正常
- [ ] Redis连接正常（如果使用）

## 🆘 获取帮助

如果遇到问题：

1. **查看日志**：`docker-compose logs api-proxy-nginx`
2. **检查配置**：`docker-compose config`
3. **重启服务**：`docker-compose restart`
4. **查看项目文档**：`README.md` 和其他 `.md` 文件

---

**🎉 恭喜！你的Gemini API代理现在已经完全配置好并可以使用了！**

配置文件：`.env`
端口：`http://localhost:8888/v1beta/...`
客户端密钥：在 `.env` 的 `GEMINI_API_KEYS_OLD` 中配置