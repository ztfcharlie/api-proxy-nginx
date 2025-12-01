#!/bin/bash

# API Proxy Service 停止脚本

set -e

echo "Stopping API Proxy Services..."

# 检查 Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "ERROR: Docker Compose is not installed or not in PATH"
    exit 1
fi

# 停止所有服务
echo "Stopping all services..."
docker-compose down

# 可选：清理数据卷
if [ "$1" = "--clean-volumes" ]; then
    echo "Removing data volumes..."
    docker-compose down -v
fi

# 可选：清理镜像
if [ "$1" = "--clean-all" ]; then
    echo "Removing containers, volumes, and images..."
    docker-compose down -v --rmi all
fi

echo "✓ Services stopped successfully!"