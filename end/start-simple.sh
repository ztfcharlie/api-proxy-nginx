#!/bin/bash

# 简化的启动脚本 - 兼容 Docker Compose 1.29.2

set -e

echo "🚀 Starting OpenResty API Proxy Service..."

# 检查必要文件
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ docker-compose.yml not found"
    exit 1
fi

# 停止现有服务
echo "🛑 Stopping existing services..."
docker stop api-proxy-nginx api-proxy-redis 2>/dev/null || true
docker rm api-proxy-nginx api-proxy-redis 2>/dev/null || true

# 清理网络
docker network rm end_api-proxy 2>/dev/null || true

# 使用 docker 命令直接启动（绕过 docker-compose 问题）
echo "🌐 Creating network..."
docker network create end_api-proxy

echo "🔴 Starting Redis..."
docker run -d \
  --name api-proxy-redis \
  --network end_api-proxy \
  -p 6379:6379 \
  -v end_redis-data:/data \
  redis:6-alpine \
  redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru

echo "🔨 Building OpenResty image..."
docker build -t end_api-proxy-nginx .

echo "🟢 Starting OpenResty..."
docker run -d \
  --name api-proxy-nginx \
  --network end_api-proxy \
  -p 8888:8080 \
  -p 8443:8443 \
  -e TZ=Asia/Shanghai \
  -v $(pwd)/nginx/nginx.conf:/usr/local/openresty/nginx/conf/nginx.conf:ro \
  -v $(pwd)/nginx/conf.d:/usr/local/openresty/nginx/conf/conf.d:ro \
  -v $(pwd)/lua:/usr/local/openresty/lualib:ro \
  -v $(pwd)/logs:/usr/local/openresty/nginx/logs \
  -v $(pwd)/html:/usr/local/openresty/nginx/html:ro \
  -v $(pwd)/ssl:/usr/local/openresty/nginx/conf/ssl:ro \
  -v $(pwd)/data:/usr/local/openresty/nginx/data:ro \
  -v $(pwd)/config:/usr/local/openresty/nginx/config:ro \
  --restart unless-stopped \
  end_api-proxy-nginx

# 等待服务启动
echo "⏳ Waiting for services to start..."
sleep 10

# 健康检查
echo "🏥 Checking service health..."
for i in {1..30}; do
    if curl -f -s http://localhost:8888/health > /dev/null 2>&1; then
        echo "✅ Service is healthy!"
        break
    fi

    if [ $i -eq 30 ]; then
        echo "❌ Health check failed"
        echo "📋 Logs:"
        docker logs --tail=20 api-proxy-nginx
        exit 1
    fi

    echo "⏳ Waiting... ($i/30)"
    sleep 2
done

echo ""
echo "🎉 Services started successfully!"
echo ""
echo "📊 Service URLs:"
echo "   - Health: http://localhost:8888/health"
echo "   - Status: http://localhost:8888/status"
echo "   - Main:   http://localhost:8888/"
echo ""
echo "📋 Container Status:"
docker ps --filter "name=api-proxy" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "🔧 Management Commands:"
echo "   - View logs: docker logs -f api-proxy-nginx"
echo "   - Stop:      ./stop-simple.sh"
echo "   - Restart:   docker restart api-proxy-nginx"
echo ""