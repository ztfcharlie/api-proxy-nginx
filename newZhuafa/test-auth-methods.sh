#!/bin/bash

echo "=== 测试 Google Generative Language API 认证方式 ==="
echo ""

# 检查是否有有效的服务账号配置
if [ ! -f "service-account.json" ]; then
    echo "❌ 需要 service-account.json 文件来测试"
    exit 1
fi

# 提取服务账号信息
PROJECT_ID=$(cat service-account.json | jq -r '.project_id')
CLIENT_EMAIL=$(cat service-account.json | jq -r '.client_email')

if [ "$PROJECT_ID" = "your-project-id" ] || [ "$PROJECT_ID" = "null" ]; then
    echo "❌ service-account.json 文件未正确配置"
    exit 1
fi

echo "📋 使用项目: $PROJECT_ID"
echo "📧 服务账号: $CLIENT_EMAIL"
echo ""

# 获取 OAuth2 访问令牌
echo "1. 获取 OAuth2 访问令牌..."

# 这里需要实际的 OAuth2 令牌获取逻辑
# 为了测试，我们可以使用 gcloud 命令（如果可用）
if command -v gcloud &> /dev/null; then
    echo "   使用 gcloud 获取访问令牌..."
    ACCESS_TOKEN=$(gcloud auth print-access-token 2>/dev/null)

    if [ -n "$ACCESS_TOKEN" ]; then
        echo "   ✅ 成功获取访问令牌"
    else
        echo "   ❌ 无法获取访问令牌"
        echo "   请运行: gcloud auth login"
        exit 1
    fi
else
    echo "   ❌ gcloud 命令不可用"
    echo "   请安装 Google Cloud SDK 或手动获取访问令牌"
    exit 1
fi

echo ""

# 测试 API 端点
API_URL="https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent"
TEST_DATA='{"model": "models/gemini-embedding-001", "content": {"parts":[{"text": "test"}]}}'

echo "2. 测试不同的认证方式..."
echo ""

# 测试 1: 使用 Authorization Bearer
echo "🔐 测试 1: Authorization Bearer 认证"
RESPONSE1=$(curl -s -w "HTTP_CODE:%{http_code}" "$API_URL" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$TEST_DATA")

HTTP_CODE1=$(echo "$RESPONSE1" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
BODY1=$(echo "$RESPONSE1" | sed 's/HTTP_CODE:[0-9]*$//')

echo "   状态码: $HTTP_CODE1"
if [ "$HTTP_CODE1" = "200" ]; then
    echo "   ✅ Authorization Bearer 认证成功"
elif [ "$HTTP_CODE1" = "401" ]; then
    echo "   ❌ Authorization Bearer 认证失败 (401 Unauthorized)"
elif [ "$HTTP_CODE1" = "403" ]; then
    echo "   ❌ Authorization Bearer 认证失败 (403 Forbidden)"
else
    echo "   ⚠️  其他状态码: $HTTP_CODE1"
fi
echo "   响应: $(echo "$BODY1" | head -c 200)..."
echo ""

# 测试 2: 使用 x-goog-api-key (需要 API key)
echo "🔑 测试 2: x-goog-api-key 认证"
echo "   ⚠️  需要有效的 API key 来测试此方法"
echo "   如果你有 API key，请手动测试:"
echo "   curl '$API_URL' \\"
echo "     -H 'x-goog-api-key: YOUR_API_KEY' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '$TEST_DATA'"
echo ""

# 总结
echo "📊 测试结果总结:"
echo "   Authorization Bearer: HTTP $HTTP_CODE1"

if [ "$HTTP_CODE1" = "200" ]; then
    echo ""
    echo "✅ 结论: Google Generative Language API 支持 Authorization Bearer 认证"
    echo "   当前的 OAuth2 实现是正确的"
elif [ "$HTTP_CODE1" = "401" ] || [ "$HTTP_CODE1" = "403" ]; then
    echo ""
    echo "❌ 结论: Authorization Bearer 认证失败"
    echo "   可能的原因:"
    echo "   1. API 不支持 Bearer token 认证"
    echo "   2. 服务账号权限不足"
    echo "   3. 需要使用 x-goog-api-key 认证"
    echo ""
    echo "🔧 建议: 检查 Google 官方文档确认正确的认证方式"
fi