#!/bin/bash

echo "🚀 启动基础服务 (MySQL + Redis)"
echo "================================"

cd "$(dirname "$0")"

# 检查Docker环境
if ! command -v docker &> /dev/null; then
    echo "❌ Docker未安装，请先安装Docker"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker服务未运行，请启动Docker"
    exit 1
fi

echo "✅ Docker环境检查通过"

# 创建必要目录
echo "📁 创建基础服务数据目录..."
mkdir -p mysql-data redis-data
mkdir -p data/client data/map

# 检查database目录
if [ ! -d "database" ]; then
    echo "❌ database目录不存在，请确保schema.sql文件存在"
    exit 1
fi

if [ ! -f "database/schema.sql" ]; then
    echo "❌ database/schema.sql文件不存在"
    exit 1
fi

echo "✅ 必要文件和目录检查通过"

# 停止现有基础服务
echo "🛑 停止现有基础服务..."
docker-compose -f docker-compose-base-service.yml down

# 清理网络（重新创建）
echo "🔄 清理并重建网络..."
docker network rm api-proxy-network 2>/dev/null || true

# 启动基础服务
echo "🚀 启动基础服务..."
docker-compose -f docker-compose-base-service.yml up -d

# 等待服务启动
echo "⏳ 等待MySQL和Redis服务启动..."
sleep 45

# 验证服务状态
echo "🔍 验证基础服务状态..."
docker-compose -f docker-compose-base-service.yml ps

# 测试MySQL连接
echo "🗄️ 测试MySQL数据库连接..."
max_attempts=10
attempt=1

while [ $attempt -le $max_attempts ]; do
    if docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysqladmin ping -h localhost -u oauth2_user -poauth2_password_123456 2>/dev/null; then
        echo "✅ MySQL连接成功！"
        break
    else
        echo "⏳ MySQL还未就绪，等待10秒... (尝试 $attempt/$max_attempts)"
        sleep 10
        ((attempt++))
    fi
done

if [ $attempt -gt $max_attempts ]; then
    echo "❌ MySQL启动失败，查看日志..."
    docker-compose -f docker-compose-base-service.yml logs api-proxy-mysql
    exit 1
fi

# 验证数据库初始化
echo "📋 验证数据库初始化..."
if docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;" 2>/dev/null; then
    echo "✅ 数据库已初始化"
    tables_count=$(docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema='oauth2_mock';" 2>/dev/null | tail -1)
    echo "📊 数据库表数量: $tables_count"
else
    echo "❌ 数据库初始化失败或未完成"
    echo "🔍 检查MySQL错误日志:"
    docker-compose -f docker-compose-base-service.yml logs api-proxy-mysql | tail -20
fi

# 测试Redis连接
echo "💾 测试Redis缓存连接..."
if docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 ping 2>/dev/null; then
    echo "✅ Redis连接成功！"
else
    echo "❌ Redis连接失败"
    docker-compose -f docker-compose-base-service.yml logs api-proxy-redis
fi

# 验证网络创建
echo "🔗 验证网络创建..."
if docker network ls | grep api-proxy-network > /dev/null; then
    echo "✅ 网络api-proxy-network已创建"

    echo "📋 网络详情:"
    docker network inspect api-proxy-network --format='{{range .Containers}}{{.Name}}{{end}}' 2>/dev/null | tr '\n' ', ' || echo "无容器连接"
else
    echo "❌ 网络创建失败"
fi

# 最终状态检查
echo ""
echo "🎉 基础服务启动完成！"
echo ""
echo "📍 服务地址:"
echo "   - MySQL数据库: localhost:3306"
echo "   - Redis缓存: localhost:6379"
echo "   - 网络名称: api-proxy-network"
echo ""
echo "🔧 下一步操作:"
echo "   1. 启动Node.js应用服务: cd nodejs && docker-compose up -d"
echo "   2. 启动OpenResty网关: docker-compose up -d"
echo ""
echo "📊 查看服务状态: docker-compose -f docker-compose-base-service.yml ps"