#!/bin/bash

# OpenResty库测试脚本

echo "=== Testing OpenResty Libraries ==="

echo "1. Checking OpenResty installation..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -V

echo ""
echo "2. Checking available Lua libraries..."
docker-compose exec api-proxy-nginx find /usr/local/openresty -name "*.lua" | grep -E "(resty|http)" | head -10

echo ""
echo "3. Testing resty.http availability..."
docker-compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
local ok, http = pcall(require, 'resty.http')
if ok then
    print('✓ resty.http is available')
    print('  Version: ' .. tostring(http._VERSION or 'unknown'))
else
    print('✗ resty.http not found: ' .. tostring(http))
end
"

echo ""
echo "4. Testing cjson availability..."
docker-compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
local ok, cjson = pcall(require, 'cjson')
if ok then
    print('✓ cjson is available')
    local test = {test = 'value'}
    print('  Test encode: ' .. cjson.encode(test))
else
    print('✗ cjson not found: ' .. tostring(cjson))
end
"

echo ""
echo "5. Checking Lua package paths..."
docker-compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
print('Package path:')
for path in package.path:gmatch('[^;]+') do
    print('  ' .. path)
end
print('')
print('Package cpath:')
for path in package.cpath:gmatch('[^;]+') do
    print('  ' .. path)
end
"

echo ""
echo "6. Testing our custom Lua modules..."
docker-compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
package.path = '/usr/local/openresty/lua/?.lua;' .. package.path

-- Test utils module
local ok, utils = pcall(require, 'utils')
if ok then
    print('✓ utils.lua loaded successfully')
else
    print('✗ utils.lua failed: ' .. tostring(utils))
end

-- Test config module
local ok, config = pcall(require, 'config')
if ok then
    print('✓ config.lua loaded successfully')
else
    print('✗ config.lua failed: ' .. tostring(config))
end
"

echo ""
echo "7. Testing nginx configuration with new paths..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -t

echo ""
echo "=== OpenResty Libraries Test Complete ==="