# Google Gemini API Proxy

基于 OpenResty 的 Google Gemini API 代理服务，用于替换客户端 API key 并转发请求到 Google API。

## 功能特性

- ✅ 透明代理 Google Gemini API
- ✅ 自动替换客户端 API key 为服务端 Google API key
- ✅ 支持 HTTP 流式和非流式请求
- ✅ 请求日志记录（不记录请求体和响应体，保护隐私）
- ✅ Docker Compose 部署
- ✅ 健康检查端点

## 快速开始

### 1. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，设置你的 Google API key
# GEMINI_API_KEY=your-actual-google-api-key
```

### 2. 启动服务

```bash
# 使用启动脚本（推荐）
chmod +x start.sh
./start.sh

# 或者直接使用 docker-compose
docker-compose up -d
```

### 3. 测试服务

```bash
# 健康检查
curl http://localhost:8888/health

# 测试 API 代理
curl "http://localhost:8888/v1beta/models/gemini-embedding-001:embedContent" \
  -H "x-goog-api-key: any-client-key" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "models/gemini-embedding-001",
    "content": {"parts":[{"text": "What is the meaning of life?"}]}
  }'
```

## API 转换说明

代理会自动将请求转换：

**客户端请求：**
```
POST http://localhost:8888/v1beta/models/gemini-embedding-001:embedContent
x-goog-api-key: client-api-key
```

**转发到 Google：**
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent
x-goog-api-key: your-google-api-key
```

## 日志

请求日志保存在 `logs/requests.log`，包含：
- 请求 ID
- 时间戳
- 请求 URL
- Google API 返回状态码
- 请求持续时间
- 客户端 IP

```bash
# 查看实时日志
tail -f logs/requests.log

# 查看容器日志
docker-compose logs -f
```

## 配置

主要配置文件：
- `lua/config.lua` - 主配置文件
- `.env` - 环境变量
- `nginx.conf` - Nginx 配置
- `docker-compose.yaml` - Docker 配置

## 管理命令

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看日志
docker-compose logs -f

# 查看服务状态
docker-compose ps
```

## 端口说明

- `8888` - HTTP 代理端口
- `8443` - HTTPS 代理端口（可选）

## 故障排除

1. **服务启动失败**
   - 检查 `.env` 文件是否存在且配置正确
   - 检查端口 8888 是否被占用

2. **API key 错误**
   - 确认 `GEMINI_API_KEY` 在 `.env` 文件中正确设置
   - 检查 Google API key 是否有效

3. **请求失败**
   - 查看容器日志：`docker-compose logs`
   - 查看请求日志：`tail -f logs/requests.log`