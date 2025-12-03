#!/bin/bash

echo "🧪 测试构建和部署"
echo "=================="

cd "$(dirname "$0")"

# 清理之前的构建
echo "🧹 清理之前的构建..."
cd nodejs
docker-compose down
docker system prune -f

echo "🔨 重新构建Node.js服务..."
docker-compose build --no-cache

if [ $? -eq 0 ]; then
    echo "✅ Node.js服务构建成功"
else
    echo "❌ Node.js服务构建失败"
    exit 1
fi

echo "🚀 启动Node.js服务栈..."
docker-compose up -d

echo "⏳ 等待服务启动..."
sleep 30

echo "🔍 检查服务状态..."
docker-compose ps

echo "🏥 健康检查..."
if curl -f http://localhost:8889/health > /dev/null 2>&1; then
    echo "✅ Node.js OAuth2服务健康检查通过"
else
    echo "❌ Node.js OAuth2服务健康检查失败"
    docker-compose logs api-proxy-nodejs
fi

echo "🔗 检查网络连接..."
if docker network ls | grep api-proxy-network > /dev/null; then
    echo "✅ 网络api-proxy-network已创建"
    echo "网络详情："
    docker network inspect api-proxy-network --format='{{json .Containers}}' | python3 -m json.tool 2>/dev/null || echo "无法解析网络详情"
else
    echo "❌ 网络未创建"
fi

echo "📊 查看资源使用情况..."
docker stats --no-stream

echo "🎉 测试完成！"