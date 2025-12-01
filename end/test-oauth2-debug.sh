#!/bin/bash

echo "=== OAuth2 Debug Test Script ==="
echo "This script will test the OAuth2 flow and show detailed debug logs"
echo ""

# 检查服务状态
echo "1. Checking service status..."
curl -s http://localhost:8888/health > /dev/null
if [ $? -eq 0 ]; then
    echo "✓ Service is running"
else
    echo "✗ Service is not accessible"
    echo "Please make sure the service is running with: docker-compose up -d"
    exit 1
fi

echo ""
echo "2. Making OAuth2 test request..."
echo "This will trigger the OAuth2 flow and generate debug logs"

# 发送测试请求
curl -v -X POST http://localhost:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Hello, this is a test message"
          }
        ]
      }
    ]
  }' 2>&1

echo ""
echo ""
echo "3. Checking OAuth2 debug logs..."
echo "Looking for [OAuth2-DEBUG] entries in the logs..."
echo ""

# 等待一下让日志写入
sleep 2

# 显示OAuth2相关的日志
echo "=== OAuth2 Debug Logs ==="
docker logs api-proxy-nginx 2>&1 | grep -A 5 -B 5 "OAuth2-DEBUG" | tail -50

echo ""
echo "=== Recent Error Logs ==="
docker logs api-proxy-nginx 2>&1 | grep -E "(error|ERROR|failed|FAILED)" | tail -10

echo ""
echo "=== Test Complete ==="
echo "Check the logs above for OAuth2 request details including:"
echo "- Target URL and headers"
echo "- JWT assertion details"
echo "- Curl command output"
echo "- HTTP response codes"
echo "- Response body content"