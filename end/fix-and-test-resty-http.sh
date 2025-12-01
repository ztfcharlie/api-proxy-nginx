#!/bin/bash

# 修复配置并正确测试resty.http

echo "=== Fixing Nginx Config and Testing resty.http ==="

echo "1. Cleaning up broken nginx configuration..."
docker-compose exec api-proxy-nginx sh -c "
# 移除可能添加的错误配置
sed -i '/# Temporary test endpoint/,\$d' /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf

# 确保配置文件以正确的}结尾
echo '}' >> /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf
"

echo ""
echo "2. Testing nginx configuration syntax..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -t

if [ $? -ne 0 ]; then
    echo "✗ Nginx configuration has syntax errors"
    echo "Let's check the end of the config file:"
    docker-compose exec api-proxy-nginx tail -10 /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf

    echo ""
    echo "Attempting to fix..."
    docker-compose exec api-proxy-nginx sh -c "
    # 移除多余的}
    sed -i '\$d' /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf
    # 确保只有一个}结尾
    echo '}' >> /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf
    "

    # 再次测试
    docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -t
fi

echo ""
echo "3. Reloading nginx configuration..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -s reload

echo ""
echo "4. Testing resty.http by modifying existing /health endpoint temporarily..."

# 备份原始的gemini-proxy.conf
docker-compose exec api-proxy-nginx cp /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf /tmp/gemini-proxy.conf.backup

# 修改/health端点来测试resty.http
docker-compose exec api-proxy-nginx sh -c "
sed -i '/location \/health {/,/}/ {
    /content_by_lua_block {/,/}/ {
        /content_by_lua_block {/a\
            -- Test resty.http availability\
            local resty_http_ok, http = pcall(require, \"resty.http\")\
            if resty_http_ok then\
                ngx.log(ngx.INFO, \"resty.http is available in nginx context\")\
            else\
                ngx.log(ngx.ERR, \"resty.http not available: \", tostring(http))\
            end\

    }
}' /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf
"

echo ""
echo "5. Reloading nginx with modified health endpoint..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -s reload

echo ""
echo "6. Testing /health endpoint (should log resty.http status)..."
curl -s http://localhost:8888/health > /dev/null

echo ""
echo "7. Checking nginx logs for resty.http test results..."
docker logs api-proxy-nginx --tail 10 | grep -i "resty.http"

echo ""
echo "8. Restoring original health endpoint..."
docker-compose exec api-proxy-nginx cp /tmp/gemini-proxy.conf.backup /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -s reload

echo ""
echo "9. If resty.http is working, restore full auth_manager.lua..."

# 检查日志中是否有成功信息
if docker logs api-proxy-nginx --tail 20 | grep -q "resty.http is available"; then
    echo "✓ resty.http is working in nginx!"

    echo ""
    echo "Restoring original auth_manager.lua..."
    if [ -f lua/auth_manager_original.lua ]; then
        cp lua/auth_manager_original.lua lua/auth_manager.lua
        echo "✓ Restored original auth_manager.lua"

        echo ""
        echo "Restarting nginx with full functionality..."
        docker-compose restart api-proxy-nginx

        echo ""
        echo "Waiting for startup..."
        sleep 15

        echo ""
        echo "Testing full functionality:"
        echo "Health check:"
        curl -s -w "HTTP %{http_code}\n" http://localhost:8888/health

        echo ""
        echo "Status check:"
        curl -s -w "HTTP %{http_code}\n" http://localhost:8888/status

        echo ""
        echo "Checking for any Lua errors in logs:"
        docker logs api-proxy-nginx --tail 10 | grep -i error || echo "No errors found"

    else
        echo "✗ Original auth_manager.lua backup not found"
    fi
else
    echo "✗ resty.http is not working properly"
    echo "Check the logs above for details"
fi

echo ""
echo "=== Fix and Test Complete ==="