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

### 1. 配置 Vertex AI Service Account

#### 方式一：使用 JSON 文件 (推荐)
```bash
# 复制 JSON 模板文件
cp service-account.json.example service-account.json

# 将你的 Vertex AI JSON key 内容粘贴到 service-account.json 文件中
# 文件位置: ./service-account.json
```

#### 方式二：使用环境变量 (备选)
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，设置服务账号信息
# GOOGLE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
# GOOGLE_PROJECT_ID=your-google-project-id
# GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

**📁 JSON 文件位置**: `./service-account.json` (与 docker-compose.yaml 同级目录)
**🔄 优先级**: JSON 文件 > 环境变量

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
Authorization: Bearer oauth2-access-token
```

## 日志

系统提供多种日志文件：

### 📋 日志文件说明

1. **自定义请求日志** (`logs/requests.log`)
   - 请求 ID、时间戳、请求 URL、状态码、持续时间、客户端 IP
   - 不记录请求体和响应体（隐私保护）

2. **Nginx Access 日志**
   - `logs/access.log` - 详细格式的访问日志
   - `logs/proxy_access.log` - 代理服务器访问日志
   - `logs/api_requests.log` - API 请求的 JSON 格式日志

3. **Nginx Error 日志**
   - `logs/error.log` - 全局错误日志
   - `logs/proxy_error.log` - 代理服务器错误日志

### 🔍 日志查看方法

```bash
# 使用日志查看工具（推荐）
chmod +x view-logs.sh
./view-logs.sh

# 手动查看实时日志
tail -f logs/requests.log          # 自定义请求日志
tail -f logs/api_requests.log      # API 请求 JSON 日志
tail -f logs/proxy_error.log       # 错误日志

# 查看容器日志
docker-compose logs -f
docker logs -f api-proxy-nginx

# 查看最近日志
tail -50 logs/access.log           # 最近50行访问日志
tail -50 logs/proxy_error.log      # 最近50行错误日志
```

### 📊 日志格式示例

**详细访问日志格式：**
```
192.168.1.100 - - [28/Nov/2024:10:30:45 +0000] "POST /v1beta/models/gemini-embedding-001:embedContent HTTP/1.1" 200 1234 "-" "curl/7.68.0" "-" req_id="req_1732789845123_456789" upstream_time="0.245" request_time="0.250" upstream_status="200"
```

**JSON 格式日志：**
```json
{
  "timestamp":"2024-11-28T10:30:45+00:00",
  "remote_addr":"192.168.1.100",
  "request_method":"POST",
  "request_uri":"/v1beta/models/gemini-embedding-001:embedContent",
  "status":200,
  "body_bytes_sent":1234,
  "request_time":0.250,
  "upstream_response_time":"0.245",
  "upstream_status":"200",
  "user_agent":"curl/7.68.0",
  "request_id":"req_1732789845123_456789"
}
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