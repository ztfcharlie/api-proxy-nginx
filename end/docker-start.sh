#!/bin/bash

# 一键启动脚本 - 兼容所有 Docker Compose 版本

set -e

echo "🚀 Starting OpenResty API Proxy Service..."

# 尝试使用新版本 Docker Compose
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
    echo "✅ Using Docker Compose V2"
    docker compose up -d --build
elif command -v docker-compose &> /dev/null; then
    echo "✅ Using Docker Compose V1"
    # 如果 V1 有问题，使用手动方式
    if ! docker-compose up -d --build 2>/dev/null; then
        echo "⚠️  Docker Compose V1 failed, using manual method..."

        # 手动启动
        echo "🛑 Cleaning up..."
        docker stop api-proxy-nginx api-proxy-redis 2>/dev/null || true
        docker rm api-proxy-nginx api-proxy-redis 2>/dev/null || true
        docker network rm end_api-proxy 2>/dev/null || true

        echo "🌐 Creating network..."
        docker network create end_api-proxy

        echo "🔴 Starting Redis..."
        docker run -d \
          --name api-proxy-redis \
          --network end_api-proxy \
          -p 6379:6379 \
          -v $(pwd)/redis-data:/data \
          redis:6-alpine \
          redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru

        echo "🔨 Building OpenResty..."
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
    fi
else
    echo "❌ Docker not found"
    exit 1
fi

# 等待服务启动
echo "⏳ Waiting for services..."
sleep 15

# 健康检查
echo "🏥 Health check..."
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
echo "🎉 OpenResty API Proxy Service started successfully!"
echo ""
echo "📊 Service URLs:"
echo "   - Health: http://localhost:8888/health"
echo "   - Status: http://localhost:8888/status"
echo "   - Main:   http://localhost:8888/"
echo ""
echo "📋 Container Status:"
docker ps --filter "name=api-proxy" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "🔧 Management:"
echo "   - Logs:    docker logs -f api-proxy-nginx"
echo "   - Stop:    docker stop api-proxy-nginx api-proxy-redis"
echo "   - Restart: docker restart api-proxy-nginx"
echo ""