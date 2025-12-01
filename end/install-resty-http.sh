#!/bin/bash

# 安装resty.http模块的脚本

echo "=== Installing resty.http Module ==="

echo "1. Checking if resty.http is already available..."
docker-compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
local ok, http = pcall(require, 'resty.http')
if ok then
    print('✓ resty.http is already available')
    os.exit(0)
else
    print('✗ resty.http not found, proceeding with installation')
    os.exit(1)
end
" && exit 0

echo ""
echo "2. Installing resty.http in container..."

# 方法1: 尝试从OpenResty官方源安装
docker-compose exec api-proxy-nginx sh -c "
echo 'Installing resty.http...'

# 检查是否有opm (OpenResty Package Manager)
if command -v opm >/dev/null 2>&1; then
    echo 'Using opm to install lua-resty-http...'
    opm install ledgetech/lua-resty-http
else
    echo 'opm not available, installing manually...'

    # 手动安装
    cd /tmp

    # 检查是否有wget或curl
    if command -v wget >/dev/null 2>&1; then
        wget -O lua-resty-http.tar.gz https://github.com/ledgetech/lua-resty-http/archive/refs/tags/v0.16.1.tar.gz
    elif command -v curl >/dev/null 2>&1; then
        curl -L -o lua-resty-http.tar.gz https://github.com/ledgetech/lua-resty-http/archive/refs/tags/v0.16.1.tar.gz
    else
        echo 'Neither wget nor curl available, cannot download'
        exit 1
    fi

    # 解压并安装
    tar -xzf lua-resty-http.tar.gz
    cd lua-resty-http-*

    # 复制到OpenResty库目录
    mkdir -p /usr/local/openresty/lualib/resty
    cp lib/resty/http.lua /usr/local/openresty/lualib/resty/
    cp lib/resty/http_headers.lua /usr/local/openresty/lualib/resty/

    echo 'Manual installation completed'
fi
"

echo ""
echo "3. Testing resty.http installation..."
docker-compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
local ok, http = pcall(require, 'resty.http')
if ok then
    print('✓ resty.http installation successful')
    print('Version: ' .. tostring(http._VERSION or 'unknown'))
else
    print('✗ resty.http installation failed: ' .. tostring(http))
end
"

echo ""
echo "4. If installation successful, restore original auth_manager.lua..."
if docker-compose exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
local ok = pcall(require, 'resty.http')
os.exit(ok and 0 or 1)
"; then
    echo "✓ resty.http is working, restoring original auth_manager.lua..."

    if [ -f lua/auth_manager_original.lua ]; then
        cp lua/auth_manager_original.lua lua/auth_manager.lua
        echo "✓ Restored original auth_manager.lua"

        echo ""
        echo "5. Restarting services with original auth_manager..."
        docker-compose restart api-proxy-nginx

        echo ""
        echo "6. Testing with original auth_manager..."
        sleep 10
        docker logs api-proxy-nginx --tail 10

        echo ""
        echo "Testing endpoints:"
        curl -s -w "HTTP %{http_code}\n" http://localhost:8888/health
    else
        echo "✗ Original auth_manager.lua backup not found"
    fi
else
    echo "✗ resty.http installation failed, keeping minimal version"
fi

echo ""
echo "=== Installation Complete ==="