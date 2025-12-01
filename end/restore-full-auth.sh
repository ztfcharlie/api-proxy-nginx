#!/bin/bash

# 恢复完整auth_manager.lua功能的脚本

echo "=== Restoring Full auth_manager.lua Functionality ==="

echo "1. Current auth_manager.lua status..."
head -3 lua/auth_manager.lua

echo ""
echo "2. Checking if original auth_manager.lua backup exists..."
if [ -f lua/auth_manager_original.lua ]; then
    echo "✓ Original backup found"
    echo "First few lines of original:"
    head -3 lua/auth_manager_original.lua
else
    echo "✗ Original backup not found"
    echo "This means we're already using the original or it was never backed up"
fi

echo ""
echo "3. Testing resty.http availability..."
docker-compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
local ok, http = pcall(require, 'resty.http')
if ok then
    print('✓ resty.http is available')
    print('Version: ' .. tostring(http._VERSION or 'unknown'))

    -- 测试HTTP客户端创建
    local httpc = http.new()
    if httpc and type(httpc.request_uri) == 'function' then
        print('✓ HTTP client methods available')
    else
        print('✗ HTTP client methods missing')
    end
else
    print('✗ resty.http not available: ' .. tostring(http))
    print('Need to install resty.http first')
    os.exit(1)
end
"

if [ $? -ne 0 ]; then
    echo ""
    echo "resty.http is not available. Installing now..."

    # 尝试手动安装
    chmod +x manual-install-resty-http.sh
    ./manual-install-resty-http.sh

    # 再次测试
    docker-compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
    local ok, http = pcall(require, 'resty.http')
    if not ok then
        print('Installation failed, cannot proceed')
        os.exit(1)
    end
    "

    if [ $? -ne 0 ]; then
        echo "✗ Failed to install resty.http, cannot restore full functionality"
        exit 1
    fi
fi

echo ""
echo "4. resty.http is available, restoring original auth_manager.lua..."

if [ -f lua/auth_manager_original.lua ]; then
    # 恢复原始文件
    cp lua/auth_manager_original.lua lua/auth_manager.lua
    echo "✓ Restored original auth_manager.lua"
else
    echo "No backup found, assuming current file is correct"
fi

echo ""
echo "5. Testing auth_manager.lua syntax..."
docker-compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
package.path = '/usr/local/openresty/lua/?.lua;' .. package.path

local ok, auth_manager = pcall(require, 'auth_manager')
if ok then
    print('✓ auth_manager.lua loaded successfully')

    -- 检查关键函数
    if type(auth_manager.authenticate_client) == 'function' then
        print('✓ authenticate_client function available')
    else
        print('✗ authenticate_client function missing')
    end

    if type(auth_manager.get_api_host) == 'function' then
        print('✓ get_api_host function available')
    else
        print('✗ get_api_host function missing')
    end
else
    print('✗ auth_manager.lua failed to load: ' .. tostring(auth_manager))
    os.exit(1)
end
"

if [ $? -ne 0 ]; then
    echo "✗ auth_manager.lua has syntax errors, keeping minimal version"
    cp lua/auth_manager_minimal.lua lua/auth_manager.lua
    exit 1
fi

echo ""
echo "6. Restarting nginx with full auth_manager..."
docker-compose restart api-proxy-nginx

echo ""
echo "7. Waiting for nginx to start..."
sleep 15

echo ""
echo "8. Checking nginx startup logs..."
docker logs api-proxy-nginx --tail 20

echo ""
echo "9. Testing endpoints with full functionality..."
echo "Testing /health:"
curl -s -w "HTTP %{http_code}\n" http://localhost:8888/health | head -5

echo ""
echo "Testing /status:"
curl -s -w "HTTP %{http_code}\n" http://localhost:8888/status | head -5

echo ""
echo "10. Testing API endpoint (should return auth error, but shows routing works):"
curl -s -w "HTTP %{http_code}\n" -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"test"}]}]}' | head -3

echo ""
echo "=== Full Functionality Restoration Complete ==="
echo ""
echo "If all tests passed, the full auth_manager.lua is now working!"
echo "If there were errors, check the nginx logs: docker logs api-proxy-nginx"