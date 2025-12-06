#!/bin/bash

# ==============================================
# API Proxy Service 启动脚本
# ==============================================
set -e

# 添加 OpenResty 二进制路径到 PATH
export PATH=$PATH:/usr/local/openresty/bin

echo "[INFO] Starting API Proxy Service..."
echo "[INFO] Date: $(date)"

# --- 1. 目录初始化 ---
echo "[INFO] Checking directory structure..."
DIRS=(
    "/var/log/nginx"
    "/var/run"
)

for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        echo "[INFO] Creating directory: $dir"
        mkdir -p "$dir"
    fi
    # 确保权限正确 (nobody 是 Nginx 默认运行用户)
    chown -R nobody:nobody "$dir"
done

# --- 2. 环境变量默认值设置 ---
export WORKER_PROCESSES=${WORKER_PROCESSES:-auto}
export WORKER_CONNECTIONS=${WORKER_CONNECTIONS:-1024}
export REDIS_PORT=${REDIS_PORT:-6379}

# --- 3. 依赖服务检查 (Redis) ---
if [ -n "$REDIS_HOST" ]; then
    echo "[INFO] Redis configuration detected (Host: $REDIS_HOST, Port: $REDIS_PORT)"
    echo "[INFO] Waiting for Redis connection..."
    
    # 使用 resty (Lua CLI) 进行更可靠的连接测试，不依赖 nc
    MAX_RETRIES=30
    COUNT=0
    CONNECTED=0

    while [ $COUNT -lt $MAX_RETRIES ]; do
        # 尝试连接 Redis
        if resty -e "local sock = ngx.socket.tcp(); local ok, err = sock:connect('$REDIS_HOST', $REDIS_PORT); if not ok then ngx.say('fail'); ngx.exit(1) end; ngx.say('ok'); sock:close();" > /dev/null 2>&1; then
            echo "[INFO] Redis connection successful!"
            CONNECTED=1
            break
        fi
        
        echo "[WARN] Waiting for Redis... ($((MAX_RETRIES - COUNT)) attempts remaining)"
        sleep 1
        COUNT=$((COUNT + 1))
    done

    if [ $CONNECTED -eq 0 ]; then
        echo "[ERROR] Timeout waiting for Redis at $REDIS_HOST:$REDIS_PORT"
        echo "[WARN] Starting OpenResty without verified Redis connection (some features may fail)"
    fi
else
    echo "[INFO] No REDIS_HOST configured, skipping Redis check."
fi

# --- 4. 配置检查 ---
echo "[INFO] Testing Nginx configuration..."
# 检查 nginx 配置语法
openresty -t -c /usr/local/openresty/nginx/conf/nginx.conf

if [ $? -ne 0 ]; then
    echo "[CRITICAL] Nginx configuration test failed!"
    exit 1
fi

# --- 5. 启动服务 ---
echo "[INFO] Starting OpenResty..."
echo "  - Configuration: /usr/local/openresty/nginx/conf/nginx.conf"
echo "  - Lua modules:   /usr/local/openresty/nginx/lua/"
echo "  - Data path:     /usr/local/openresty/nginx/data/"
echo "  - Logs:          /var/log/nginx/"

# 使用 exec 确保 OpenResty 替代当前 shell 成为 PID 1，正确接收信号
exec openresty -g "daemon off;" -c /usr/local/openresty/nginx/conf/nginx.conf
