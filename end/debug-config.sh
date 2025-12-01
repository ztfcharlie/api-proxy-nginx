#!/bin/bash

# 详细的配置调试脚本

echo "=== Detailed Configuration Debug ==="

echo "1. Container and file structure check..."
echo "Checking if container is running..."
docker-compose ps api-proxy-nginx

echo ""
echo "Checking file structure inside container..."
docker-compose exec api-proxy-nginx find /usr/local/openresty/nginx -type f -name "*.conf" -o -name "*.lua" | head -20

echo ""
echo "2. Nginx configuration dump..."
echo "Full nginx configuration:"
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -T | head -50

echo ""
echo "3. Checking specific configuration sections..."
echo "Server blocks:"
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -T | grep -A 20 "server {"

echo ""
echo "Location blocks:"
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -T | grep -A 10 "location"

echo ""
echo "4. Lua configuration check..."
echo "Lua package paths:"
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -T | grep lua_package

echo ""
echo "Lua shared dictionaries:"
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -T | grep lua_shared_dict

echo ""
echo "5. File permissions and existence..."
echo "Nginx config files:"
docker-compose exec api-proxy-nginx ls -la /usr/local/openresty/nginx/conf/
docker-compose exec api-proxy-nginx ls -la /usr/local/openresty/nginx/conf/conf.d/

echo ""
echo "Lua modules:"
docker-compose exec api-proxy-nginx ls -la /usr/local/openresty/nginx/lua/

echo ""
echo "Data directories:"
docker-compose exec api-proxy-nginx ls -la /usr/local/openresty/nginx/data/
docker-compose exec api-proxy-nginx ls -la /usr/local/openresty/nginx/data/map/ 2>/dev/null || echo "map directory not found"
docker-compose exec api-proxy-nginx ls -la /usr/local/openresty/nginx/data/json/ 2>/dev/null || echo "json directory not found"

echo ""
echo "6. Testing nginx reload..."
echo "Reloading nginx configuration..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -s reload

echo ""
echo "7. Process and port check..."
echo "Nginx processes:"
docker-compose exec api-proxy-nginx ps aux | grep nginx

echo ""
echo "Listening ports:"
docker-compose exec api-proxy-nginx netstat -tlnp 2>/dev/null || docker-compose exec api-proxy-nginx ss -tlnp

echo ""
echo "8. Recent error logs..."
echo "Last 20 lines of error log:"
docker-compose exec api-proxy-nginx tail -20 /var/log/nginx/error.log 2>/dev/null || echo "No error log found"

echo ""
echo "9. Testing HTTP responses..."
echo "Testing root path:"
curl -s -I http://localhost:8888/ | head -5

echo ""
echo "Testing health endpoint:"
curl -s -I http://localhost:8888/health | head -5

echo ""
echo "Testing non-existent path:"
curl -s -I http://localhost:8888/nonexistent | head -5

echo ""
echo "=== Debug Complete ==="