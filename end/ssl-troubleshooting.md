# SSL问题排查和解决方案

## 1. 测试新的SSL配置

```bash
# 在Ubuntu服务器上重启服务
sudo docker-compose restart api-proxy-nginx

# 测试请求
curl -v -X POST http://localhost:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "SSL test"}]}]}'

# 检查SSL错误
sudo docker logs api-proxy-nginx 2>&1 | grep -i "ssl"
```

## 2. 如果仍有SSL证书问题

### 方案A：更新CA证书包
```bash
# 进入容器更新CA证书
sudo docker exec api-proxy-nginx apt-get update
sudo docker exec api-proxy-nginx apt-get install -y ca-certificates
sudo docker exec api-proxy-nginx update-ca-certificates
```

### 方案B：使用Google的根证书
```bash
# 下载Google的根证书
sudo docker exec api-proxy-nginx curl -o /tmp/google-roots.pem https://pki.goog/roots.pem

# 修改nginx配置使用Google根证书
# proxy_ssl_trusted_certificate /tmp/google-roots.pem;
```

### 方案C：临时禁用验证（仅用于调试）
如果需要临时调试OAuth2流程，可以短暂使用：
```nginx
proxy_ssl_verify off;  # 仅用于调试，生产环境不推荐
```

## 3. 验证SSL连接

```bash
# 测试到Google API的SSL连接
sudo docker exec api-proxy-nginx openssl s_client -connect aiplatform.googleapis.com:443 -servername aiplatform.googleapis.com

# 检查证书链
sudo docker exec api-proxy-nginx openssl s_client -connect aiplatform.googleapis.com:443 -showcerts
```

## 4. 推荐的生产环境配置

```nginx
# 最安全的配置
proxy_ssl_verify on;
proxy_ssl_verify_depth 3;
proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
proxy_ssl_server_name on;
proxy_ssl_name $api_host;
proxy_ssl_protocols TLSv1.2 TLSv1.3;
proxy_ssl_session_reuse on;
```

## 5. 监控SSL健康状态

```bash
# 创建SSL健康检查脚本
echo '#!/bin/bash
echo "Testing SSL connection to Google API..."
timeout 10 openssl s_client -connect aiplatform.googleapis.com:443 -servername aiplatform.googleapis.com < /dev/null
echo "SSL test completed with exit code: $?"' > /tmp/ssl-test.sh

sudo docker cp /tmp/ssl-test.sh api-proxy-nginx:/tmp/
sudo docker exec api-proxy-nginx chmod +x /tmp/ssl-test.sh
sudo docker exec api-proxy-nginx /tmp/ssl-test.sh
```