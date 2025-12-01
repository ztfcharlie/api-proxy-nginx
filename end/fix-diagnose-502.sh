#!/bin/bash

# 修复后的OAuth2 502错误诊断脚本

echo "=== OAuth2 502 Error Diagnosis ==="

echo "1. Checking JSON configuration files..."

echo "Testing map-config.json syntax:"
if command -v python3 >/dev/null; then
    python3 -c "
import json
try:
    with open('data/map/map-config.json', 'r') as f:
        json.load(f)
    print('✓ map-config.json is valid JSON')
except Exception as e:
    print('✗ map-config.json error:', str(e))
"
elif command -v python >/dev/null; then
    python -c "
import json
try:
    with open('data/map/map-config.json', 'r') as f:
        json.load(f)
    print('✓ map-config.json is valid JSON')
except Exception as e:
    print('✗ map-config.json error:', str(e))
"
else
    echo "Python not available, checking manually..."
    head -3 data/map/map-config.json
fi

echo ""
echo "Testing app_config.json syntax:"
if command -v python3 >/dev/null; then
    python3 -c "
import json
try:
    with open('config/app_config.json', 'r') as f:
        json.load(f)
    print('✓ app_config.json is valid JSON')
except Exception as e:
    print('✗ app_config.json error:', str(e))
"
elif command -v python >/dev/null; then
    python -c "
import json
try:
    with open('config/app_config.json', 'r') as f:
        json.load(f)
    print('✓ app_config.json is valid JSON')
except Exception as e:
    print('✗ app_config.json error:', str(e))
"
else
    echo "Python not available, showing file content:"
    cat config/app_config.json
fi

echo ""
echo "2. Checking OAuth2 logs in detail..."
echo "Looking for OAuth2 process in nginx logs:"
docker logs api-proxy-nginx --tail 100 | grep -i "oauth" || echo "No OAuth2 logs found"

echo ""
echo "Checking for any Lua errors:"
docker logs api-proxy-nginx --tail 50 | grep -E "(lua|Lua|LUA)" || echo "No Lua logs found"

echo ""
echo "Checking for 502 error details:"
docker logs api-proxy-nginx --tail 50 | grep -E "(502|Bad Gateway|upstream)" || echo "No 502 specific logs found"

echo ""
echo "3. Testing service account file..."
echo "Checking service account JSON:"
if [ -f "data/json/hulaoban-202504.json" ]; then
    echo "Service account file exists: $(wc -l < data/json/hulaoban-202504.json) lines"
    if command -v python3 >/dev/null; then
        python3 -c "
import json
try:
    with open('data/json/hulaoban-202504.json', 'r') as f:
        sa = json.load(f)
    print('✓ Service account JSON is valid')
    print('  Type:', sa.get('type', 'unknown'))
    print('  Client email:', sa.get('client_email', 'unknown'))
    print('  Has private_key:', 'private_key' in sa)
except Exception as e:
    print('✗ Service account JSON error:', str(e))
"
    else
        echo "Python not available, showing first few lines:"
        head -5 data/json/hulaoban-202504.json | grep -E "(type|client_email)" || echo "Manual check needed"
    fi
else
    echo "✗ Service account file not found!"
fi

echo ""
echo "4. Testing OAuth2 flow step by step..."
echo "Making detailed request to check each step:"

echo "Test request with verbose output:"
curl -v -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"debug test"}]}]}' 2>&1 | head -20

echo ""
echo "Checking immediate logs after request:"
sleep 2
docker logs api-proxy-nginx --tail 20

echo ""
echo "=== Diagnosis Complete ==="
echo ""
echo "Expected 502 causes:"
echo "1. OAuth2 token generation failing"
echo "2. Upstream connection to Google API failing"
echo "3. Service account configuration issues"
echo "4. JSON configuration parsing errors"