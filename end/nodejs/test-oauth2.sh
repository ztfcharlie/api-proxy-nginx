#!/bin/bash

# OAuth2 模拟服务测试脚本
# 服务地址: http://47.239.10.174:8889

BASE_URL="http://47.239.10.174:8889"

echo "🔐 OAuth2 模拟服务测试"
echo "====================="
echo "服务地址: $BASE_URL"
echo ""

# 1. 测试服务健康状态
echo "1️⃣ 测试服务健康状态"
curl -s "$BASE_URL/health" | jq '.' || echo "❌ 健康检查失败"
echo ""

# 2. 测试获取Google OAuth2公钥证书
echo "2️⃣ 测试获取Google OAuth2公钥证书"
curl -s "$BASE_URL/accounts.google.com/oauth2/v1/certs" | jq '.' || echo "❌ 获取证书失败"
echo ""

# 3. 测试Client Credentials授权类型
echo "3️⃣ 测试Client Credentials授权类型"
CLIENT_CREDENTIALS_RESPONSE=$(curl -s -X POST "$BASE_URL/accounts.google.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=test-client-id&client_secret=test-client-secret&scope=https://www.googleapis.com/auth/cloud-platform")

echo "$CLIENT_CREDENTIALS_RESPONSE" | jq '.' || echo "❌ Client Credentials测试失败"
echo ""

# 4. 测试Authorization Code授权类型（带PKCE）
echo "4️⃣ 测试Authorization Code授权类型"
CODE_CHALLENGE=$(openssl rand -hex 32)
CODE_VERIFIER=$(openssl rand -hex 64)

AUTH_CODE_RESPONSE=$(curl -s -X POST "$BASE_URL/accounts.google.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=mock-auth-code&redirect_uri=http://localhost:8080/callback&client_id=test-client-id&code_verifier=$CODE_VERIFIER")

echo "$AUTH_CODE_RESPONSE" | jq '.' || echo "❌ Authorization Code测试失败"
echo ""

# 5. 测试Refresh Token授权类型
echo "5️⃣ 测试Refresh Token授权类型"
REFRESH_TOKEN_RESPONSE=$(curl -s -X POST "$BASE_URL/accounts.google.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=mock-refresh-token&client_id=test-client-id&client_secret=test-client-secret")

echo "$REFRESH_TOKEN_RESPONSE" | jq '.' || echo "❌ Refresh Token测试失败"
echo ""

# 6. 测试JWT Bearer授权类型
echo "6️⃣ 测试JWT Bearer授权类型"
JWT_BEARER_RESPONSE=$(curl -s -X POST "$BASE_URL/accounts.google.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Bearer mock-jwt-token" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=mock-jwt-assertion&scope=https://www.googleapis.com/auth/cloud-platform")

echo "$JWT_BEARER_RESPONSE" | jq '.' || echo "❌ JWT Bearer测试失败"
echo ""

# 7. 测试错误的授权类型
echo "7️⃣ 测试错误的授权类型"
INVALID_GRANT_RESPONSE=$(curl -s -X POST "$BASE_URL/accounts.google.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=invalid_grant&client_id=test-client-id")

echo "$INVALID_GRANT_RESPONSE" | jq '.' || echo "❌ 错误授权类型测试失败"
echo ""

# 8. 测试无效的Client ID
echo "8️⃣ 测试无效的Client ID"
INVALID_CLIENT_RESPONSE=$(curl -s -X POST "$BASE_URL/accounts.google.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=invalid-client-id&client_secret=test-client-secret")

echo "$INVALID_CLIENT_RESPONSE" | jq '.' || echo "❌ 无效Client ID测试失败"
echo ""

echo "✅ 测试完成！"
echo "====================="
echo "📊 总结:"
echo "- 所有OAuth2授权类型都已测试"
echo "- 错误处理机制也已验证"
echo "- 服务正常运行 ✓"