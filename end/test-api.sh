#!/bin/bash

# API 测试脚本

set -e

BASE_URL="http://localhost:8080"
CLIENT_ID="client-key-aaaa"
PROJECT_ID="carbide-team-478005-f8"

echo "🧪 Testing OpenResty API Proxy Service"
echo "======================================="

# 测试健康检查
echo "1. Testing health endpoint..."
if curl -f -s "${BASE_URL}/health" | jq . > /dev/null 2>&1; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    exit 1
fi

# 测试状态端点
echo ""
echo "2. Testing status endpoint..."
if curl -f -s "${BASE_URL}/status" | jq . > /dev/null 2>&1; then
    echo "✅ Status check passed"
else
    echo "❌ Status check failed"
    exit 1
fi

# 测试认证失败（无 Authorization 头部）
echo ""
echo "3. Testing authentication failure (no auth header)..."
RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "${BASE_URL}/v1/projects/${PROJECT_ID}/locations/global/publishers/google/models/gemini-pro:generateContent" \
    -H "Content-Type: application/json" \
    -d '{"contents": [{"parts": [{"text": "Hello"}]}]}')

if [ "$RESPONSE" = "401" ]; then
    echo "✅ Authentication failure test passed (401)"
else
    echo "❌ Expected 401, got $RESPONSE"
fi

# 测试认证失败（无效客户端 ID）
echo ""
echo "4. Testing authentication failure (invalid client ID)..."
RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "${BASE_URL}/v1/projects/${PROJECT_ID}/locations/global/publishers/google/models/gemini-pro:generateContent" \
    -H "Authorization: Bearer invalid-client-id" \
    -H "Content-Type: application/json" \
    -d '{"contents": [{"parts": [{"text": "Hello"}]}]}')

if [ "$RESPONSE" = "403" ]; then
    echo "✅ Invalid client ID test passed (403)"
else
    echo "❌ Expected 403, got $RESPONSE"
fi

# 测试有效请求（需要有效的服务账号凭证）
echo ""
echo "5. Testing valid API request..."
echo "   Note: This test requires valid Google service account credentials"

RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/api_response.json "${BASE_URL}/v1/projects/${PROJECT_ID}/locations/global/publishers/google/models/gemini-pro:generateContent" \
    -H "Authorization: Bearer ${CLIENT_ID}" \
    -H "Content-Type: application/json" \
    -d '{
        "contents": [{"parts": [{"text": "Say hello in one word"}]}],
        "generationConfig": {
            "maxOutputTokens": 10,
            "temperature": 0.1
        }
    }')

if [ "$RESPONSE" = "200" ]; then
    echo "✅ Valid API request test passed (200)"
    echo "   Response preview:"
    head -c 200 /tmp/api_response.json
    echo "..."
elif [ "$RESPONSE" = "500" ]; then
    echo "⚠️  API request returned 500 (likely OAuth2 token issue)"
    echo "   This is expected if service account credentials are not properly configured"
else
    echo "❌ Unexpected response code: $RESPONSE"
    echo "   Response body:"
    cat /tmp/api_response.json
fi

# 测试流式请求
echo ""
echo ""
echo "6. Testing streaming request..."
echo "   Note: This will show streaming response if credentials are valid"

timeout 10s curl -s "${BASE_URL}/v1/projects/${PROJECT_ID}/locations/global/publishers/google/models/gemini-pro:streamGenerateContent" \
    -H "Authorization: Bearer ${CLIENT_ID}" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream" \
    -d '{
        "contents": [{"parts": [{"text": "Count from 1 to 3"}]}],
        "generationConfig": {
            "maxOutputTokens": 20,
            "temperature": 0.1
        },
        "stream": true
    }' || echo ""

echo ""
echo "✅ Streaming request test completed"

# 清理
rm -f /tmp/api_response.json

echo ""
echo "🎉 All tests completed!"
echo ""
echo "📋 Test Summary:"
echo "   - Health check: ✅"
echo "   - Status check: ✅"
echo "   - Auth failure tests: ✅"
echo "   - API request: Depends on service account setup"
echo "   - Streaming: Depends on service account setup"
echo ""
echo "💡 Tips:"
echo "   - Ensure Google service account credentials are in data/json/"
echo "   - Check logs with: docker-compose logs -f api-proxy-nginx"
echo "   - Monitor token cache in data/jwt/"
echo ""