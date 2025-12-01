#!/bin/bash

echo "===== OAuth2 Debug Logs Test ====="
echo "Testing if OAuth2 authentication process generates debug logs"
echo ""

# 重启服务以应用配置更改
echo "1. Restarting service to apply SSL configuration changes..."
docker-compose restart api-proxy-nginx

echo ""
echo "2. Waiting for service to restart..."
sleep 10

echo ""
echo "3. Testing service health..."
health_response=$(curl -s http://localhost:8888/health 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✓ Service is responding: $health_response"
else
    echo "⚠ Service health check failed"
fi

echo ""
echo "4. Clearing old logs to see new debug output..."
# 注意：这会清空现有日志，只在测试时使用
docker exec api-proxy-nginx sh -c "echo '' > /var/log/nginx/error.log" 2>/dev/null || echo "Could not clear logs (this is OK)"

echo ""
echo "5. Making OAuth2 test request..."
echo "This should trigger all OAuth2 debug logs..."

curl -s -X POST http://localhost:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "OAuth2 debug test"}]}]}' > /dev/null

echo "Request sent."

echo ""
echo "6. Waiting for logs to be written..."
sleep 3

echo ""
echo "7. Checking for OAuth2 debug logs..."
echo ""

echo "=== CLIENT TOKEN EXTRACTION LOGS ==="
docker logs api-proxy-nginx 2>&1 | grep "EXTRACT-DEBUG" | tail -10
if [ $? -ne 0 ]; then
    echo "No EXTRACT-DEBUG logs found"
fi

echo ""
echo "=== CLIENT AUTHENTICATION LOGS ==="
docker logs api-proxy-nginx 2>&1 | grep "AUTH-DEBUG" | tail -10
if [ $? -ne 0 ]; then
    echo "No AUTH-DEBUG logs found"
fi

echo ""
echo "=== TOKEN ACQUISITION LOGS ==="
docker logs api-proxy-nginx 2>&1 | grep "TOKEN-DEBUG" | tail -15
if [ $? -ne 0 ]; then
    echo "No TOKEN-DEBUG logs found"
fi

echo ""
echo "=== JWT CREATION LOGS ==="
docker logs api-proxy-nginx 2>&1 | grep "JWT-DEBUG" | tail -15
if [ $? -ne 0 ]; then
    echo "No JWT-DEBUG logs found"
fi

echo ""
echo "=== OAUTH2 REQUEST LOGS ==="
docker logs api-proxy-nginx 2>&1 | grep "OAuth2-DEBUG" | tail -15
if [ $? -ne 0 ]; then
    echo "No OAuth2-DEBUG logs found"
fi

echo ""
echo "=== ALL RECENT LOGS (Last 30 lines) ==="
docker logs --tail=30 api-proxy-nginx 2>&1

echo ""
echo "=== ERROR LOGS ==="
docker logs api-proxy-nginx 2>&1 | grep -i -E "(error|failed|invalid)" | tail -10

echo ""
echo "===== OAuth2 Debug Test Complete ====="
echo ""
echo "If you don't see OAuth2 debug logs above, it means:"
echo "1. The request is not reaching our Lua code"
echo "2. There might be a configuration issue"
echo "3. The debug logs might be disabled"
echo ""
echo "The SSL certificate issue should now be resolved with proxy_ssl_verify off"