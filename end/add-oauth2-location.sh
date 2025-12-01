#!/bin/bash

# 添加OAuth2内部location到主配置

echo "=== Adding OAuth2 Internal Location ==="

echo "1. Removing problematic oauth2-internal.conf..."
rm -f nginx/conf.d/oauth2-internal.conf

echo "2. Adding OAuth2 location to gemini-proxy.conf..."

# 在gemini-proxy.conf的server块中添加OAuth2 location
# 在最后一个}之前添加

# 备份原文件
cp nginx/conf.d/gemini-proxy.conf nginx/conf.d/gemini-proxy.conf.backup

# 在文件末尾的}之前添加OAuth2 location
sed -i '$i\
\
    # OAuth2内部代理location\
    location /internal/oauth2 {\
        internal;\
\
        # 代理到Google OAuth2端点\
        proxy_pass https://oauth2.googleapis.com/token;\
\
        # 设置代理头部\
        proxy_set_header Host oauth2.googleapis.com;\
        proxy_set_header Content-Type application/x-www-form-urlencoded;\
        proxy_set_header User-Agent "OpenResty-OAuth2-Client/1.0";\
\
        # SSL设置\
        proxy_ssl_verify on;\
        proxy_ssl_verify_depth 2;\
        proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;\
\
        # 超时设置\
        proxy_connect_timeout 30s;\
        proxy_send_timeout 30s;\
        proxy_read_timeout 30s;\
\
        # 不缓冲请求和响应\
        proxy_request_buffering off;\
        proxy_buffering off;\
\
        # 传递请求体\
        proxy_pass_request_body on;\
        proxy_pass_request_headers off;\
    }' nginx/conf.d/gemini-proxy.conf

echo "✓ OAuth2 location added to gemini-proxy.conf"

echo ""
echo "3. Testing nginx configuration..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -t

if [ $? -eq 0 ]; then
    echo "✓ Nginx configuration is valid"

    echo ""
    echo "4. Restarting nginx..."
    docker-compose restart api-proxy-nginx

    echo ""
    echo "5. Waiting for startup..."
    sleep 10

    echo ""
    echo "6. Testing basic endpoints..."
    curl -s -w "HTTP %{http_code}\n" http://localhost:8888/health

    echo ""
    echo "✓ OAuth2 location successfully added and nginx restarted"
else
    echo "✗ Nginx configuration error, restoring backup..."
    cp nginx/conf.d/gemini-proxy.conf.backup nginx/conf.d/gemini-proxy.conf
    echo "Backup restored. Please check the configuration manually."
fi

echo ""
echo "=== OAuth2 Location Addition Complete ==="