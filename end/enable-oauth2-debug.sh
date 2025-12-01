#!/bin/bash

# 启用OAuth2调试模式

echo "=== Enabling OAuth2 Debug Mode ==="

echo "1. Creating debug configuration..."

# 创建调试配置文件
cat > config/app_config.json << 'EOF'
{
    "log_level": "info",
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

echo "✓ Debug configuration created"

echo ""
echo "2. Creating sample service account for testing..."

# 创建示例服务账号（用于测试JWT创建，不是真实的）
cat > data/json/test-service-account.json << 'EOF'
{
  "type": "service_account",
  "project_id": "test-project",
  "private_key_id": "test-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB\nwjRz4f/cY6hTHw3K1+WDluHcNoFX3Lhd+ANBKdmubC5Qxg/I62+HXP40rvWuzMjI\n+cfTCTCi4MHaHXnOjRK1GA2TGWPEBtYDkmkaJOOgHpecxHi9wRlpsIyW0lCpVfWv\nk/fVtPXtyBWX3K9+lsmEjIpOzscEuQbYxb2w3gYmCXRSoQvBuD94JgqJel1xlnVG\njPQHvw==\n-----END PRIVATE KEY-----",
  "client_email": "test-service@test-project.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
EOF

echo "✓ Test service account created"

echo ""
echo "3. Creating sample client configuration..."

# 创建示例客户端配置
cat > data/map/map-config.json << 'EOF'
{
    "clients": [
        {
            "client_token": "gemini-client-key-aaaa",
            "enable": true,
            "key_filename_gemini": [
                {
                    "key_filename": "test-service-account.json",
                    "key_weight": 1
                }
            ]
        }
    ],
    "key_filename_gemini": [
        {
            "key_filename": "test-service-account.json",
            "models": [
                {
                    "model": "gemini-pro",
                    "domain": "generativelanguage.googleapis.com"
                },
                {
                    "model": "gemini-pro-vision",
                    "domain": "generativelanguage.googleapis.com"
                }
            ]
        }
    ],
    "key_filename_claude": []
}
EOF

echo "✓ Sample client configuration created"

echo ""
echo "4. Restarting nginx with debug configuration..."
docker-compose restart api-proxy-nginx

echo ""
echo "5. Waiting for startup..."
sleep 15

echo ""
echo "6. Testing OAuth2 debug mode..."
echo "Making authenticated request to trigger OAuth2 flow:"

curl -v -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Debug test"}]}]}'

echo ""
echo ""
echo "7. Checking OAuth2 debug logs..."
echo "OAuth2 process logs:"
docker logs api-proxy-nginx --tail 50 | grep -E "\[OAuth2\]|\[TEST\]" || echo "No OAuth2 debug logs found"

echo ""
echo "=== OAuth2 Debug Mode Enabled ==="

echo ""
echo "Debug mode is now active. You should see detailed OAuth2 logs in:"
echo "  docker logs api-proxy-nginx | grep OAuth2"

echo ""
echo "To disable debug mode, edit config/app_config.json and set:"
echo "  \"debug_mode\": false"
echo "  \"test_output.oauth_process\": false"