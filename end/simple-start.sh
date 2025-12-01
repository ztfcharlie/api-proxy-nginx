#!/bin/bash

echo "===== Simple Docker Service Start ====="
echo ""

echo "Current directory: $(pwd)"
echo "Checking docker-compose.yml..."
if [ -f "docker-compose.yml" ]; then
    echo "✓ docker-compose.yml found"
else
    echo "✗ docker-compose.yml not found"
    exit 1
fi

echo ""
echo "Attempting to start services..."
echo "Command: docker-compose up -d"

# 尝试启动服务
docker-compose up -d

echo ""
echo "Checking if containers started..."
sleep 5

# 检查容器状态
echo "Container status:"
docker ps -a | head -1  # 显示表头
docker ps -a | grep api-proxy || echo "No api-proxy containers found"

echo ""
echo "If you see permission errors above, please run:"
echo "sudo ./simple-start.sh"
echo ""
echo "Or manually run:"
echo "sudo docker-compose up -d"
echo "sudo docker ps"
echo "sudo docker logs api-proxy-nginx"