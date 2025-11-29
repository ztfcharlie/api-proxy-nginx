#!/bin/bash

# 停止服务脚本

echo "🛑 Stopping OpenResty API Proxy Service..."

# 停止容器
docker stop api-proxy-nginx api-proxy-redis 2>/dev/null || true

# 删除容器
docker rm api-proxy-nginx api-proxy-redis 2>/dev/null || true

# 删除网络
docker network rm end_api-proxy 2>/dev/null || true

echo "✅ Services stopped successfully!"
echo ""
echo "💡 Note: Data volumes are preserved"
echo "   Redis data: end_redis-data"
echo ""