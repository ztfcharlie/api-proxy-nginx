#!/bin/bash

# 配置加载测试脚本

echo "=== Testing Nginx Configuration Loading ==="

# 1. 测试配置语法
echo "1. Testing nginx configuration syntax..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -t

echo ""
echo "2. Checking if gemini-proxy.conf is loaded..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -T | grep -A 5 -B 5 "gemini-proxy"

echo ""
echo "3. Checking server blocks..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -T | grep -A 10 "listen 8080"

echo ""
echo "4. Checking Lua package path..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -T | grep "lua_package_path"

echo ""
echo "5. Checking if Lua modules exist..."
docker-compose exec api-proxy-nginx ls -la /usr/local/openresty/nginx/lua/

echo ""
echo "6. Testing Lua module syntax..."
for lua_file in config.lua auth_manager.lua utils.lua stream_handler.lua; do
    echo "Testing $lua_file..."
    docker-compose exec api-proxy-nginx lua -e "
        package.path = '/usr/local/openresty/nginx/lua/?.lua;' .. package.path
        local ok, err = pcall(require, '${lua_file%.*}')
        if ok then
            print('✓ $lua_file loaded successfully')
        else
            print('✗ $lua_file failed to load: ' .. tostring(err))
        end
    "
done

echo ""
echo "7. Testing specific endpoints..."
echo "Testing /health endpoint..."
curl -s -w "HTTP Status: %{http_code}\n" http://localhost:8888/health

echo ""
echo "Testing /status endpoint..."
curl -s -w "HTTP Status: %{http_code}\n" http://localhost:8888/status

echo ""
echo "8. Checking nginx error logs for Lua errors..."
docker-compose exec api-proxy-nginx tail -20 /var/log/nginx/error.log | grep -i lua || echo "No Lua errors found in recent logs"

echo ""
echo "9. Testing a sample API request (should fail with auth error, but shows routing works)..."
curl -s -w "HTTP Status: %{http_code}\n" -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"test"}]}]}'

echo ""
echo "=== Configuration Test Complete ==="