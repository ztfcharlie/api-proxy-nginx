# Manual OAuth2 Debug Test Guide

## Step 1: 在Ubuntu服务器上启动Docker服务

```bash
# 在您的Ubuntu服务器上运行以下命令：

# 1. 进入项目目录
cd ~/api-proxy-nginx/end

# 2. 停止可能冲突的Apache服务
sudo systemctl stop apache2

# 3. 启动Docker服务
sudo docker-compose up -d

# 4. 检查容器状态
sudo docker ps | grep api-proxy

# 5. 等待服务启动
sleep 10
```

## Step 2: 测试OAuth2认证流程

```bash
# 测试健康检查
curl http://localhost:8888/health

# 发送OAuth2测试请求
curl -v -X POST http://localhost:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "Hello OAuth2 test"}]}]}'
```

## Step 3: 查看OAuth2调试日志

```bash
# 查看OAuth2调试日志
sudo docker logs api-proxy-nginx | grep "OAuth2-DEBUG"

# 查看最近的所有日志
sudo docker logs --tail=50 api-proxy-nginx

# 查看错误日志
sudo docker logs api-proxy-nginx | grep -i error
```

## 预期的OAuth2调试输出

您应该看到类似这样的日志：

```
[OAuth2-DEBUG] ===== OAuth2 Request Details =====
[OAuth2-DEBUG] Target URL: https://oauth2.googleapis.com/token
[OAuth2-DEBUG] Method: POST
[OAuth2-DEBUG] Headers:
[OAuth2-DEBUG]   Content-Type: application/x-www-form-urlencoded
[OAuth2-DEBUG] POST Data Length: 1234
[OAuth2-DEBUG] Grant Type: urn:ietf:params:oauth:grant-type:jwt-bearer
[OAuth2-DEBUG] JWT Assertion Length: 567
[OAuth2-DEBUG] JWT Assertion (first 100 chars): eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
[OAuth2-DEBUG] Executing curl command...
[OAuth2-DEBUG] ===== Curl Output =====
[OAuth2-DEBUG] Full curl output: [详细的curl输出包括连接信息]
[OAuth2-DEBUG] HTTP Status Code: 400
[OAuth2-DEBUG] ===== OAuth2 Response =====
[OAuth2-DEBUG] Response Body: {"error": "invalid_grant", "error_description": "Invalid JWT signature"}
```

## 如果没有看到OAuth2-DEBUG日志

可能的原因：
1. 请求没有到达认证模块
2. 客户端token映射有问题
3. 配置文件读取失败

检查步骤：
```bash
# 检查配置文件
cat data/map/map-config.json | head -20
cat config/app_config.json

# 检查服务账号文件
ls -la data/json/
cat data/json/hulaoban-202504.json | head -10
```

## 修复私钥问题

如果看到 "Invalid JWT signature" 错误，需要修复私钥：

```bash
# 编辑服务账号文件
nano data/json/hulaoban-202504.json

# 将 "Your private key content here" 替换为真实的私钥内容
# 格式应该是：
# "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

## 重启服务

```bash
# 修改配置后重启
sudo docker-compose restart api-proxy-nginx

# 再次测试
curl -X POST http://localhost:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "Hello"}]}]}'
```