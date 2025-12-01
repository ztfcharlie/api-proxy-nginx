#!/bin/bash

# Enable OAuth2 debug logging script

echo "=== Enabling OAuth2 Debug Logging ==="

echo "1. Checking current nginx configuration..."

# 检查当前debug配置
if grep -q "debug_mode.*true" config/app_config.json; then
    echo "✓ Debug mode already enabled in app_config.json"
else
    echo "Enabling debug mode in app_config.json..."

    # 备份原文件
    cp config/app_config.json config/app_config.json.backup

    # 修改debug配置
    cat > config/app_config.json << 'JSONEOF'
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
JSONEOF

    echo "✓ Debug mode enabled in app_config.json"
fi

echo ""
echo "2. Restarting nginx to apply debug settings..."
docker-compose restart api-proxy-nginx

echo ""
echo "3. Waiting for startup..."
sleep 10

echo ""
echo "4. Testing with debug logging enabled..."
echo "Making a test request to generate debug logs:"

curl -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"debug test"}]}]}' \
  -w "HTTP Status: %{http_code}" \
  -o /dev/null \
  -s

echo ""
echo ""
echo "5. Checking debug logs..."
echo "=== OAuth2 Debug Logs ==="
docker logs api-proxy-nginx --tail 50 | grep -E "\[OAuth2\]|\[TEST\]|\[DEBUG\]" || echo "No OAuth2 debug logs found yet"

echo ""
echo "=== Recent Error Logs ==="
docker logs api-proxy-nginx --tail 20 | grep -i error || echo "No recent errors"

echo ""
echo "=== All Recent Logs ==="
docker logs api-proxy-nginx --tail 30

echo ""
echo "=== Debug Logging Enabled ==="
echo ""
echo "Debug settings:"
echo "✓ app_config.json: debug_mode = true"
echo "✓ OAuth2 process logging enabled"
echo "✓ Request/response logging enabled"
