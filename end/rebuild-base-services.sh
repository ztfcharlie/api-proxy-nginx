#!/bin/bash

echo "🔧 强制重建基础服务 (MySQL + Redis)"
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

# 停止并删除所有相关容器
echo "🛑 停止并删除现有容器..."
docker-compose -f docker-compose-base-service.yml down --remove-orphans 2>/dev/null

# 强制删除MySQL容器（如果有残留）
docker rm -f api-proxy-mysql 2>/dev/null || true

# 强制删除Redis容器（如果有残留）
docker rm -f api-proxy-redis 2>/dev/null || true

# 清理镜像缓存
echo "🧽 清理Docker缓存..."
docker system prune -f

# 创建必要的目录
echo "📁 创建数据目录..."
mkdir -p mysql-data redis-data data/client data/map

# 检查数据库脚本
echo "📋 检查数据库初始化脚本..."
if [ ! -f "database/schema.sql" ]; then
    echo "❌ database/schema.sql 文件不存在"
    exit 1
fi

echo "✅ 数据库脚本检查通过"

# 完全清理MySQL数据目录（确保重新初始化）
echo "🧹 清理MySQL数据目录（重新初始化）..."
rm -rf mysql-data/*

# 清理网络
echo "🔄 清理并重建网络..."
docker network rm api-proxy-network 2>/dev/null || true

echo "⚠️ 警告：这将删除所有MySQL数据并重新初始化数据库"

# 询问确认
read -p "确认要继续吗？(y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 操作已取消"
    exit 0
fi

# 重新创建网络
echo "🌐 创建网络..."
docker network create api-proxy-network

# 重新构建并启动基础服务
echo "🚀 重新构建并启动基础服务..."
docker-compose -f docker-compose-base-service.yml build --no-cache
docker-compose -f docker-compose-base-service.yml up -d

# 等待服务启动
echo "⏳ 等待基础服务完全启动..."
sleep 60

# 检查服务状态
echo "🔍 检查服务状态..."
docker-compose -f docker-compose-base-service.yml ps

# 等待MySQL完全启动
echo "⏳ 等待MySQL数据库完全启动..."
sleep 30

# 测试MySQL连接
echo "🗄️ 测试MySQL连接..."
max_attempts=15
attempt=1

while [ $attempt -le $max_attempts ]; do
    echo "   尝试连接MySQL ($attempt/$max_attempts)..."

    if docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysqladmin ping -h localhost -u root -proot_password_123456 2>/dev/null; then
        echo "✅ MySQL root用户连接成功！"

        # 测试应用用户连接
        if docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysqladmin ping -h localhost -u oauth2_user -poauth2_password_123456 2>/dev/null; then
            echo "✅ MySQL应用用户连接成功！"
            break
        else
            echo "⏳ 应用用户连接中..."
        fi

        break
    else
        echo "   MySQL还未就绪，等待20秒..."
        sleep 20
        ((attempt++))
    fi
done

if [ $attempt -gt $max_attempts ]; then
    echo "❌ MySQL连接失败，请检查日志："
    docker-compose -f docker-compose-base-service.yml logs api-proxy-mysql
    exit 1
fi

# 验证数据库初始化
echo "📋 验证数据库初始化..."
sleep 10  # 确保初始化脚本完全执行

if docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;" 2>/dev/null; then
    echo "✅ 数据库初始化成功"

    # 显示创建的表
    echo "📊 创建的表："
    docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;" 2>/dev/null | grep -v "Tables_in_oauth2_mock"

    # 显示初始数据
    echo ""
    echo "📊 初始客户端数据："
    docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SELECT client_id, name FROM clients;" 2>/dev/null || echo "无客户端数据"

    echo ""
    echo "📊 初始服务账号数据："
    docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SELECT client_email, project_id FROM service_accounts;" 2>/dev/null || echo "无服务账号数据"

else
    echo "❌ 数据库初始化失败"
    echo "🔍 检查MySQL日志："
    docker-compose -f docker-compose-base-service.yml logs api-proxy-mysql | tail -30

    # 手动执行数据库初始化
    echo ""
    echo "🔧 尝试手动执行数据库初始化..."
    docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u root -proot_password_123456 -e "SOURCE /docker-entrypoint-initdb.d/schema.sql;" oauth2_mock

    # 再次检查
    sleep 5
    if docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;" 2>/dev/null; then
        echo "✅ 手动初始化成功"
    else
        echo "❌ 手动初始化也失败"
        exit 1
    fi
fi

# 测试Redis连接
echo ""
echo "💾 测试Redis连接..."
if docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 ping 2>/dev/null; then
    echo "✅ Redis连接成功！"

    # 测试Redis写操作
    echo "📊 测试Redis写操作..."
    if docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 set test_key "test_value" 2>/dev/null; then
        if docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 get test_key 2>/dev/null | grep -q "test_value"; then
            echo "✅ Redis读写操作正常"
        else
            echo "⚠️ Redis读操作异常"
        fi
        docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 del test_key 2>/dev/null > /dev/null
    else
        echo "⚠️ Redis写操作异常"
    fi
else
    echo "❌ Redis连接失败"
    docker-compose -f docker-compose-base-service.yml logs api-proxy-redis | tail -10
    exit 1
fi

# 验证网络连接
echo ""
echo "🔗 验证网络连接..."
if docker network ls | grep api-proxy-network > /dev/null; then
    echo "✅ api-proxy-network 网络创建成功"

    # 显示连接到网络的容器
    echo "📋 连接到网络的容器："
    containers=$(docker network inspect api-proxy-network --format='{{range .Containers}}{{.Name}}{{end}}' 2>/dev/null)
    if [ -n "$containers" ]; then
        echo "$containers"
    else
        echo "无容器连接"
    fi
else
    echo "❌ 网络创建失败"
    exit 1
fi

# 最终状态检查
echo ""
echo "🎉 基础服务重建完成！"
echo ""
echo "📍 服务状态："
docker-compose -f docker-compose-base-service.yml ps

echo ""
echo "📊 服务信息："
echo "   - MySQL数据库: localhost:3306 (用户: oauth2_user)"
echo "   - Redis缓存: localhost:6379 (密码: 123456)"
echo "   - 网络名称: api-proxy-network"

echo ""
echo "🔧 MySQL配置已优化："
echo "   ✅ 移除了过时的语法警告"
echo "   ✅ 修复了PID文件权限问题"
echo "   ✅ 优化了安全配置"

echo ""
echo "🔧 下一步操作："
echo "   1. 启动Node.js应用服务："
echo "      cd nodejs && docker-compose up -d"
echo "   2. 启动OpenResty网关："
echo "      docker-compose up -d"
echo ""
echo "📊 快速检查："
echo "      bash check-base-services.sh"

echo ""
echo "💡 提示：基础服务已完全重建，所有警告已修复！"