#!/bin/bash

# API Proxy Service 启动脚本

set -e

echo "Starting API Proxy Services..."

# 检查 Docker 和 Docker Compose
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not in PATH"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "ERROR: Docker Compose is not installed or not in PATH"
    exit 1
fi

# 检查必要的目录
echo "Checking directories..."
REQUIRED_DIRS=(
    "config"
    "data/json"
    "data/jwt"
    "data/map"
    "logs"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        echo "Creating directory: $dir"
        mkdir -p "$dir"
    fi
done

# 检查配置文件
echo "Checking configuration files..."

# 创建默认的 app_config.json（如果不存在）
if [ ! -f "config/app_config.json" ]; then
    echo "Creating default app_config.json..."
    cat > config/app_config.json << 'EOF'
{
    "log_level": "info",
    "debug_mode": false,
    "test_output": {
        "enabled": false,
        "request_headers": false,
        "oauth_process": false,
        "upstream_headers": false
    },
    "token_refresh": {
        "interval": 3000,
        "early_refresh": 300
    },
    "timeouts": {
        "proxy_read": 300,
        "proxy_connect": 60,
        "keepalive": 65
    }
}
EOF
fi

# 创建默认的 map-config.json（如果不存在）
if [ ! -f "data/map/map-config.json" ]; then
    echo "Creating default map-config.json..."
    cat > data/map/map-config.json << 'EOF'
{
    "clients": [
        {
            "client_token": "demo-client-token",
            "enable": true,
            "key_filename_gemini": [
                {
                    "key_filename": "demo-service-account.json",
                    "key_weight": 1
                }
            ]
        }
    ],
    "key_filename_gemini": [
        {
            "key_filename": "demo-service-account.json",
            "models": [
                {
                    "model": "gemini-pro",
                    "domain": "generativelanguage.googleapis.com"
                },
                {
                    "model": "gemini-pro-vision",
                    "domain": "generativelanguage.googleapis.com"
                }
            ]
        }
    ],
    "key_filename_claude": []
}
EOF
fi

# 启动服务
echo "Starting services..."

# 选择启动模式
if [ "$1" = "--with-logging" ]; then
    echo "Starting with logging service..."
    docker-compose --profile logging up -d
else
    echo "Starting basic services..."
    docker-compose up -d
fi

# 等待服务启动
echo "Waiting for services to start..."
sleep 10

# 检查服务状态
echo "Checking service status..."
docker-compose ps

# 检查健康状态
echo "Checking health status..."
for i in {1..30}; do
    if curl -f http://localhost:8888/health &>/dev/null; then
        echo "✓ API Proxy service is healthy"
        break
    fi
    echo "Waiting for API Proxy service... ($i/30)"
    sleep 2
done

if ! curl -f http://localhost:8888/health &>/dev/null; then
    echo "✗ API Proxy service health check failed"
    echo "Checking logs..."
    docker-compose logs api-proxy-nginx
    exit 1
fi

echo "✓ All services started successfully!"
echo ""
echo "Service URLs:"
echo "  - API Proxy: http://localhost:8888"
echo "  - Health Check: http://localhost:8888/health"
echo "  - Status: http://localhost:8888/status"
echo "  - Redis: localhost:6379"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop services: docker-compose down"