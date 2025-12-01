#!/bin/bash

# 诊断500错误的脚本

echo "=== Diagnosing 500 Error ==="

echo "1. Checking nginx error logs..."
echo "=== Error Log ==="
cat logs/error.log
echo ""

echo "=== Access Log ==="
cat logs/access.log
echo ""

echo "2. Checking container logs for Lua errors..."
echo "=== Container Logs (last 50 lines) ==="
docker logs api-proxy-nginx --tail 50

echo ""
echo "3. Checking for Lua module loading errors..."
docker-compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
package.path = '/usr/local/openresty/lua/?.lua;' .. package.path

print('Testing Lua modules...')

-- Test config module
local ok, config = pcall(require, 'config')
if ok then
    print('✓ config module loaded')
else
    print('✗ config module failed: ' .. tostring(config))
end

-- Test utils module
local ok, utils = pcall(require, 'utils')
if ok then
    print('✓ utils module loaded')
else
    print('✗ utils module failed: ' .. tostring(utils))
end

-- Test auth_manager module
local ok, auth_manager = pcall(require, 'auth_manager')
if ok then
    print('✓ auth_manager module loaded')
else
    print('✗ auth_manager module failed: ' .. tostring(auth_manager))
end

-- Test oauth2_client module
local ok, oauth2_client = pcall(require, 'oauth2_client')
if ok then
    print('✓ oauth2_client module loaded')
else
    print('✗ oauth2_client module failed: ' .. tostring(oauth2_client))
end
" 2>&1

echo ""
echo "4. Checking configuration files..."
echo "=== Checking map-config.json ==="
if [ -f data/map/map-config.json ]; then
    echo "File exists, checking JSON syntax:"
    jq . data/map/map-config.json || echo "Invalid JSON format"
else
    echo "File not found: data/map/map-config.json"
fi

echo ""
echo "=== Checking app_config.json ==="
if [ -f config/app_config.json ]; then
    echo "File exists, checking JSON syntax:"
    jq . config/app_config.json || echo "Invalid JSON format"
else
    echo "File not found: config/app_config.json"
fi

echo ""
echo "5. Testing a simple request to trigger detailed logs..."
echo "Making request to trigger error logging..."

# 启用详细日志
curl -v -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"test"}]}]}' 2>&1 | head -20

echo ""
echo ""
echo "6. Checking logs immediately after request..."
echo "=== New Error Log Entries ==="
tail -10 logs/error.log

echo ""
echo "=== New Container Log Entries ==="
docker logs api-proxy-nginx --tail 10

echo ""
echo "7. Checking nginx worker processes..."
docker-compose exec api-proxy-nginx ps aux | grep nginx

echo ""
echo "8. Testing basic nginx functionality..."
echo "Testing /health endpoint:"
curl -s http://localhost:8888/health | jq . || echo "Health endpoint failed"

echo ""
echo "Testing /status endpoint:"
curl -s http://localhost:8888/status | jq . || echo "Status endpoint failed"

echo ""
echo "=== Diagnosis Complete ==="

echo ""
echo "Common causes of 500 errors:"
echo "1. Lua syntax errors in modules"
echo "2. Missing or invalid configuration files"
echo "3. File permission issues"
echo "4. Missing dependencies"
echo "5. Runtime errors in auth_manager"

echo ""
echo "Next steps based on findings above:"
echo "- Check for Lua module loading errors"
echo "- Verify configuration file syntax"
echo "- Check file permissions in data/ directory"