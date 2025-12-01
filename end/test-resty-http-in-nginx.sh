#!/bin/bash

# 在nginx环境中测试resty.http的脚本

echo "=== Testing resty.http in Nginx Environment ==="

echo "1. Checking if resty.http files are installed..."
docker-compose exec api-proxy-nginx ls -la /usr/local/openresty/lualib/resty/ | grep http

echo ""
echo "2. Creating a test endpoint to verify resty.http works in nginx..."

# 创建一个临时的测试配置
docker-compose exec api-proxy-nginx sh -c "
cat > /tmp/test-resty-http.conf << 'EOF'
location /test-resty-http {
    content_by_lua_block {
        local ok, http = pcall(require, 'resty.http')
        if ok then
            ngx.say('✓ resty.http loaded successfully in nginx')
            ngx.say('Version: ' .. tostring(http._VERSION or 'unknown'))

            -- 测试创建HTTP客户端
            local httpc = http.new()
            if httpc then
                ngx.say('✓ HTTP client created successfully')
                if type(httpc.request_uri) == 'function' then
                    ngx.say('✓ request_uri method available')
                else
                    ngx.say('✗ request_uri method missing')
                end
            else
                ngx.say('✗ Failed to create HTTP client')
            end
        else
            ngx.say('✗ resty.http failed to load: ' .. tostring(http))
        end
    }
}
EOF

# 将测试配置添加到主配置中
if ! grep -q 'test-resty-http' /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf; then
    echo '' >> /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf
    echo '    # Temporary test endpoint' >> /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf
    cat /tmp/test-resty-http.conf >> /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf
fi
"

echo ""
echo "3. Reloading nginx configuration..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -s reload

echo ""
echo "4. Testing resty.http through nginx..."
curl -s http://localhost:8888/test-resty-http

echo ""
echo "5. If resty.http works, restore original auth_manager.lua..."

# 检查测试结果
if curl -s http://localhost:8888/test-resty-http | grep -q "✓ resty.http loaded successfully"; then
    echo "✓ resty.http is working in nginx environment!"

    echo ""
    echo "6. Restoring original auth_manager.lua..."
    if [ -f lua/auth_manager_original.lua ]; then
        cp lua/auth_manager_original.lua lua/auth_manager.lua
        echo "✓ Restored original auth_manager.lua"

        echo ""
        echo "7. Restarting nginx with full auth_manager..."
        docker-compose restart api-proxy-nginx

        echo ""
        echo "8. Waiting for nginx to start..."
        sleep 15

        echo ""
        echo "9. Testing with full auth_manager..."
        echo "Checking nginx logs:"
        docker logs api-proxy-nginx --tail 10

        echo ""
        echo "Testing endpoints:"
        echo "Health check:"
        curl -s -w "HTTP %{http_code}\n" http://localhost:8888/health

        echo ""
        echo "Status check:"
        curl -s -w "HTTP %{http_code}\n" http://localhost:8888/status

    else
        echo "✗ Original auth_manager.lua backup not found"
    fi
else
    echo "✗ resty.http is not working properly in nginx"
    echo "Check the test output above for details"
fi

echo ""
echo "=== Test Complete ==="