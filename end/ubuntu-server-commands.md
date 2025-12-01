# Ubuntu服务器操作指南

## 1. 重启服务以应用SSL配置修复

```bash
# 在Ubuntu服务器上执行以下命令：

# 进入项目目录
cd ~/api-proxy-nginx/end

# 重启服务
sudo docker-compose restart api-proxy-nginx

# 等待服务启动
sleep 10

# 检查服务状态
sudo docker ps | grep api-proxy
```

## 2. 测试OAuth2认证流程

```bash
# 发送测试请求
curl -v -X POST http://localhost:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "OAuth2 debug test"}]}]}'
```

## 3. 查看OAuth2调试日志

```bash
# 查看客户端Token提取日志
sudo docker logs api-proxy-nginx 2>&1 | grep "EXTRACT-DEBUG"

# 查看客户端认证日志
sudo docker logs api-proxy-nginx 2>&1 | grep "AUTH-DEBUG"

# 查看Token获取日志
sudo docker logs api-proxy-nginx 2>&1 | grep "TOKEN-DEBUG"

# 查看JWT创建日志
sudo docker logs api-proxy-nginx 2>&1 | grep "JWT-DEBUG"

# 查看OAuth2请求日志
sudo docker logs api-proxy-nginx 2>&1 | grep "OAuth2-DEBUG"

# 查看所有最近日志
sudo docker logs --tail=50 api-proxy-nginx
```

## 4. 检查SSL问题是否解决

```bash
# 查看错误日志
sudo docker logs api-proxy-nginx 2>&1 | grep -i "ssl certificate verify error"

# 如果还有SSL错误，检查最新的错误日志
tail -f ~/api-proxy-nginx/end/logs/error.log
```

## 5. 预期结果

### 成功的OAuth2调试日志应该包含：

```
[EXTRACT-DEBUG] ===== Extracting Client Token =====
[EXTRACT-DEBUG] Successfully extracted client token: gemini-client-key-aaaa

[AUTH-DEBUG] ===== Starting Client Authentication =====
[AUTH-DEBUG] Client token extracted: gemini-client-key-aaaa
[AUTH-DEBUG] Selected service account file: hulaoban-202504.json

[TOKEN-DEBUG] ===== Starting Token Acquisition Process =====
[TOKEN-DEBUG] Service account details:
[TOKEN-DEBUG]   - client_email: fsdf-822@carbide-team-478005-f8.iam.gserviceaccount.com
[TOKEN-DEBUG]   - private_key (first 50 chars): -----BEGIN PRIVATE KEY-----\nYour private key...

[JWT-DEBUG] ===== Creating JWT Assertion =====
[JWT-DEBUG] JWT header JSON: {"alg":"RS256","typ":"JWT"}
[JWT-DEBUG] JWT payload details:
[JWT-DEBUG]   - iss (issuer): fsdf-822@carbide-team-478005-f8.iam.gserviceaccount.com
[JWT-DEBUG]   - scope: https://www.googleapis.com/auth/cloud-platform

[OAuth2-DEBUG] ===== OAuth2 Request Details =====
[OAuth2-DEBUG] Target URL: https://oauth2.googleapis.com/token
[OAuth2-DEBUG] HTTP Status Code: 400
[OAuth2-DEBUG] Response Body: {"error": "invalid_grant", "error_description": "Invalid JWT signature"}
```

### 如果看到 "Invalid JWT signature" 错误：

这说明服务账号文件中的私钥是占位符，需要替换为真实的私钥：

```bash
# 编辑服务账号文件
sudo nano ~/api-proxy-nginx/end/data/json/hulaoban-202504.json

# 将 "Your private key content here" 替换为真实的私钥内容
```

## 6. SSL问题解决验证

修复后，您应该不再看到以下错误：
- `upstream SSL certificate verify error: (18:self-signed certificate)`
- `connect() to [IPv6地址]:443 failed (101: Network unreachable)`

## 7. 如果仍有问题

```bash
# 检查nginx配置语法
sudo docker exec api-proxy-nginx nginx -t

# 重新加载nginx配置
sudo docker exec api-proxy-nginx nginx -s reload

# 查看详细的容器日志
sudo docker logs api-proxy-nginx --tail=100
```