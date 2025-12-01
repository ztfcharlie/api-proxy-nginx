#!/bin/bash

# 启用详细调试日志

echo "=== Enabling Debug Logging ==="

echo "1. Updating app_config.json for debug mode..."

# 备份原配置
cp config/app_config.json config/app_config.json.backup

# 启用调试模式
cat > config/app_config.json << 'EOF'
{
  "log_level": "debug",
  "debug_mode": true,
  "test_output": {
    "enabled": true,
    "request_headers": true,
    "oauth_process": true,
    "upstream_headers": true
  },
  "token_refresh": {
    "interval": 3000,
    "early_refresh": 300
  },
  "timeouts": {
    "proxy_read": 300,
    "proxy_connect": 60,
    "keepalive": 65
  }
}
EOF

echo "✓ Debug mode enabled in app_config.json"

echo ""
echo "2. Updating nginx.conf for debug logging..."

# 备份nginx配置
cp nginx/nginx.conf nginx/nginx.conf.backup

# 修改错误日志级别为debug
sed -i 's/error_log.*warn/error_log \/var\/log\/nginx\/error.log debug/' nginx/nginx.conf

echo "✓ Nginx error log level set to debug"

echo ""
echo "3. Restarting services with debug logging..."
docker-compose restart api-proxy-nginx

echo ""
echo "4. Waiting for startup..."
sleep 15

echo ""
echo "5. Making test request to generate logs..."
curl -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"debug test"}]}]}' \
  -w "HTTP Status: %{http_code}\n" \
  -s

echo ""
echo "6. Checking debug logs..."
echo "=== All Recent Logs ==="
docker logs api-proxy-nginx --tail 50

echo ""
echo "=== OAuth2 Specific Logs ==="
docker logs api-proxy-nginx | grep -i oauth || echo "Still no OAuth2 logs"

echo ""
echo "=== Lua Execution Logs ==="
docker logs api-proxy-nginx | grep -E "(lua|access_by_lua|Lua)" || echo "No Lua execution logs"

echo ""
echo "=== Error Logs ==="
docker logs api-proxy-nginx | grep -i error | tail -10 || echo "No error logs"

echo ""
echo "=== Debug Logging Enabled ==="
echo "If still no OAuth2 logs appear, the Lua code may not be executing at all."
echo "This could indicate a configuration issue in the nginx location block."