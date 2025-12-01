#!/bin/bash

# API Proxy Service 状态检查脚本

set -e

echo "Checking API Proxy Services Status..."

# 检查 Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "ERROR: Docker Compose is not installed or not in PATH"
    exit 1
fi

# 显示服务状态
echo "=== Service Status ==="
docker-compose ps

echo ""
echo "=== Container Health ==="
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== Health Checks ==="

# 检查 API Proxy
echo -n "API Proxy Health: "
if curl -f -s http://localhost:8888/health > /dev/null 2>&1; then
    echo "✓ Healthy"
    echo "  Response: $(curl -s http://localhost:8888/health | jq -r '.status // "unknown"')"
else
    echo "✗ Unhealthy"
fi

# 检查 Redis
echo -n "Redis Health: "
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "✓ Healthy"
else
    echo "✗ Unhealthy"
fi

echo ""
echo "=== Service URLs ==="
echo "  - API Proxy: http://localhost:8888"
echo "  - Health Check: http://localhost:8888/health"
echo "  - Status: http://localhost:8888/status"
echo "  - Redis: localhost:6379"

echo ""
echo "=== Recent Logs ==="
echo "API Proxy logs (last 10 lines):"
docker-compose logs --tail=10 api-proxy-nginx

echo ""
echo "Redis logs (last 5 lines):"
docker-compose logs --tail=5 redis