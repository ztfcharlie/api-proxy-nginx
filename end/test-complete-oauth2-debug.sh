#!/bin/bash

echo "===== Complete OAuth2 Debug Test ====="
echo "This will show every step of the OAuth2 authentication process"
echo ""

# 检查服务状态
echo "1. Checking service status..."
if curl -s http://localhost:8888/health > /dev/null 2>&1; then
    echo "✓ Service is running on port 8888"
    PORT=8888
elif curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "✓ Service is running on port 8080"
    PORT=8080
else
    echo "✗ Service not accessible. Please start with: sudo docker-compose up -d"
    exit 1
fi

echo ""
echo "2. Making OAuth2 test request..."
echo "This will trigger the complete OAuth2 authentication flow"

# 发送测试请求
curl -v -X POST http://localhost:$PORT/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "Hello OAuth2 complete test"}]}]}' 2>&1

echo ""
echo ""
echo "3. Extracting OAuth2 debug logs..."
echo ""

# 等待日志写入
sleep 2

echo "=== CLIENT TOKEN EXTRACTION LOGS ==="
sudo docker logs api-proxy-nginx 2>&1 | grep "EXTRACT-DEBUG" | tail -20

echo ""
echo "=== CLIENT AUTHENTICATION LOGS ==="
sudo docker logs api-proxy-nginx 2>&1 | grep "AUTH-DEBUG" | tail -20

echo ""
echo "=== TOKEN ACQUISITION LOGS ==="
sudo docker logs api-proxy-nginx 2>&1 | grep "TOKEN-DEBUG" | tail -30

echo ""
echo "=== JWT CREATION LOGS ==="
sudo docker logs api-proxy-nginx 2>&1 | grep "JWT-DEBUG" | tail -30

echo ""
echo "=== OAUTH2 REQUEST LOGS ==="
sudo docker logs api-proxy-nginx 2>&1 | grep "OAuth2-DEBUG" | tail -30

echo ""
echo "=== ERROR LOGS ==="
sudo docker logs api-proxy-nginx 2>&1 | grep -i -E "(error|failed|invalid)" | tail -10

echo ""
echo "===== Complete OAuth2 Debug Test Finished ====="
echo ""
echo "The logs above show the complete OAuth2 authentication flow:"
echo "1. Authorization header extraction and client token parsing"
echo "2. Client authentication and service account selection"
echo "3. Service account file reading and validation"
echo "4. JWT header, payload creation and signing process"
echo "5. OAuth2 request to Google with curl details"
echo "6. Google API response and token parsing"
echo ""
echo "Look for any errors in the process, especially:"
echo "- Invalid JWT signature (private key issues)"
echo "- Network connectivity problems"
echo "- Service account permission issues"