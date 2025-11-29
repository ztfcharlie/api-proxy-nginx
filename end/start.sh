#!/bin/bash

# OpenResty API Proxy Service 启动脚本

set -e

echo "🚀 Starting OpenResty API Proxy Service..."

# 检查必要的目录和文件
echo "📁 Checking directories and files..."

# 创建必要的目录
mkdir -p logs ssl

# 检查配置文件
if [ ! -f "config/app_config.json" ]; then
    echo "❌ Missing config/app_config.json"
    exit 1
fi

if [ ! -f "data/map/map-client.json" ]; then
    echo "❌ Missing data/map/map-client.json"
    exit 1
fi

if [ ! -f "data/map/map-client-json.json" ]; then
    echo "❌ Missing data/map/map-client-json.json"
    exit 1
fi

if [ ! -f "data/map/map-json-model-region.json" ]; then
    echo "❌ Missing data/map/map-json-model-region.json"
    exit 1
fi

# 检查服务账号凭证
if [ ! -d "data/json" ] || [ -z "$(ls -A data/json)" ]; then
    echo "❌ No service account credentials found in data/json/"
    exit 1
fi

echo "✅ All required files found"

# 创建 JWT 缓存目录
mkdir -p data/jwt

# 检查 Docker 和 Docker Compose
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed"
    exit 1
fi

echo "✅ Docker and Docker Compose are available"

# 构建和启动服务
echo "🔨 Building and starting services..."

# 停止现有服务（如果有）
docker-compose down 2>/dev/null || true

# 构建并启动服务
docker-compose up --build -d

# 等待服务启动
echo "⏳ Waiting for services to start..."
sleep 10

# 检查服务状态
echo "🔍 Checking service health..."

# 检查 Redis
if docker-compose ps api-proxy-redis | grep -q "Up"; then
    echo "✅ Redis is running"
else
    echo "❌ Redis failed to start"
    docker-compose logs api-proxy-redis
    exit 1
fi

# 检查 OpenResty
if docker-compose ps api-proxy-nginx | grep -q "Up"; then
    echo "✅ OpenResty is running"
else
    echo "❌ OpenResty failed to start"
    docker-compose logs api-proxy-nginx
    exit 1
fi

# 测试健康检查端点
echo "🏥 Testing health endpoint..."
sleep 5

if curl -f -s http://localhost:8080/health > /dev/null; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    echo "📋 OpenResty logs:"
    docker-compose logs --tail=20 api-proxy-nginx
    exit 1
fi

echo ""
echo "🎉 OpenResty API Proxy Service started successfully!"
echo ""
echo "📊 Service Information:"
echo "   - HTTP Port: 8080"
echo "   - HTTPS Port: 8443"
echo "   - Health Check: http://localhost:8080/health"
echo "   - Status: http://localhost:8080/status"
echo ""
echo "📝 Useful Commands:"
echo "   - View logs: docker-compose logs -f"
echo "   - Stop service: docker-compose down"
echo "   - Restart: docker-compose restart"
echo ""
echo "🔧 Configuration files:"
echo "   - App config: config/app_config.json"
echo "   - Client mapping: data/map/"
echo "   - Service accounts: data/json/"
echo ""