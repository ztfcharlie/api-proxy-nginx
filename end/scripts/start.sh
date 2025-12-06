#!/bin/bash

# API Proxy Service 启动脚本
set -e

echo "Starting API Proxy Service..."

# 检查必要的目录
echo "Checking directories..."
for dir in "/usr/local/openresty/nginx/data/json" "/usr/local/openresty/nginx/data/jwt" "/usr/local/openresty/nginx/data/map" "/var/log/nginx"; do
    if [ ! -d "$dir" ]; then
        echo "Creating directory: $dir"
        mkdir -p "$dir"
        chown nobody:nobody "$dir"
    fi
done

# 检查配置文件
echo "Checking configuration files..."

# 检查 nginx 配置语法
echo "Testing nginx configuration..."
/usr/local/openresty/bin/openresty -t

if [ $? -ne 0 ]; then
    echo "ERROR: nginx configuration test failed!"
    exit 1
fi

# 设置环境变量默认值
export WORKER_PROCESSES=${WORKER_PROCESSES:-auto}
export WORKER_CONNECTIONS=${WORKER_CONNECTIONS:-1024}

# 等待 Redis 连接（如果配置了 Redis）
if [ -n "$REDIS_HOST" ]; then
    echo "Waiting for Redis connection..."
    timeout=30
    while [ $timeout -gt 0 ]; do
        if nc -z "$REDIS_HOST" "${REDIS_PORT:-6379}" 2>/dev/null; then
            echo "Redis is available"
            break
        fi
        echo "Waiting for Redis... ($timeout seconds remaining)"
        sleep 1
        timeout=$((timeout - 1))
    done

    if [ $timeout -eq 0 ]; then
        echo "WARNING: Redis connection timeout, continuing without Redis"
    fi
fi

# 创建 PID 目录
mkdir -p /var/run
chown nobody:nobody /var/run

# 启动 OpenResty
echo "Starting OpenResty..."
echo "Configuration: /usr/local/openresty/nginx/conf/nginx.conf"
echo "Lua modules: /usr/local/openresty/nginx/lua/"
echo "Data directory: /usr/local/openresty/nginx/data/"
echo "Log directory: /var/log/nginx/"

# 使用 exec 确保 OpenResty 成为 PID 1
exec /usr/local/openresty/bin/openresty -g "daemon off;"