#!/bin/bash

# 修复resty.http问题的脚本

echo "=== Fixing resty.http Issue ==="

echo "1. Checking current auth_manager.lua..."
head -5 lua/auth_manager.lua

echo ""
echo "2. Using minimal version to test nginx startup..."

# 备份原始文件
if [ ! -f lua/auth_manager_original.lua ]; then
    cp lua/auth_manager.lua lua/auth_manager_original.lua
    echo "✓ Backed up original auth_manager.lua"
fi

# 使用最小化版本
cp lua/auth_manager_minimal.lua lua/auth_manager.lua
echo "✓ Using minimal auth_manager.lua"

echo ""
echo "3. Restarting services..."
docker-compose down
docker-compose up -d

echo ""
echo "4. Waiting for services to start..."
sleep 10

echo ""
echo "5. Checking nginx startup..."
docker logs api-proxy-nginx --tail 20

echo ""
echo "6. Testing basic endpoints..."
echo "Testing /health:"
curl -s -w "HTTP %{http_code}\n" http://localhost:8888/health

echo ""
echo "Testing /status:"
curl -s -w "HTTP %{http_code}\n" http://localhost:8888/status

echo ""
echo "7. Checking if resty.http is available in container..."
docker-compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
local ok, http = pcall(require, 'resty.http')
if ok then
    print('✓ resty.http is available')
else
    print('✗ resty.http not found')
    print('Available resty modules:')
    local handle = io.popen('find /usr/local/openresty -name \"resty\" -type d 2>/dev/null')
    if handle then
        local result = handle:read('*a')
        handle:close()
        print(result)
    end
end
"

echo ""
echo "=== Fix Complete ==="
echo ""
echo "If nginx is now running successfully, we can proceed to install resty.http"
echo "If not, there may be other issues to resolve first."