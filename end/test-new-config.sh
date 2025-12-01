#!/bin/bash

# 测试新的 map-config.json 配置和 lazy loading 实现

echo "=========================================="
echo "测试新配置结构和 Lazy Loading"
echo "=========================================="
echo ""

# 配置
API_URL="http://localhost:8888/v1/projects/test-project/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent"
CLIENT_TOKEN="gemini-client-key-aaaa"

echo "1. 测试健康检查端点"
echo "-------------------------------------------"
curl -s http://localhost:8888/health | jq .
echo ""

echo "2. 测试状态端点"
echo "-------------------------------------------"
curl -s http://localhost:8888/status | jq .
echo ""

echo "3. 测试 API 请求（使用 gemini-client-key-aaaa）"
echo "-------------------------------------------"
echo "Client Token: $CLIENT_TOKEN"
echo "API URL: $API_URL"
echo ""

curl -X POST "$API_URL" \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Hello, this is a test message"
      }]
    }]
  }' \
  -v

echo ""
echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="
echo ""
echo "检查要点："
echo "1. 配置是否正确加载（status endpoint）"
echo "2. client_token 是否正确识别"
echo "3. 根据前缀 'gemini-' 是否选择了正确的服务账号"
echo "4. Token 是否按需获取（lazy loading）"
echo "5. API 请求是否成功转发"
echo ""
echo "查看日志："
echo "docker compose logs -f api-proxy-nginx"
