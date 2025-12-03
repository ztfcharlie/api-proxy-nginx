#!/bin/bash

echo "🔍 基础服务状态检查"
echo "=================="

cd "$(dirname "$0")"

# 检查基础服务容器状态
echo "📊 容器状态:"
docker-compose -f docker-compose-base-service.yml ps

# 检查网络状态
echo ""
echo "🔗 网络状态:"
if docker network ls | grep api-proxy-network > /dev/null; then
    echo "✅ api-proxy-network 网络已创建"

    echo "📋 连接到网络的容器:"
    docker network inspect api-proxy-network --format='{{range .Containers}}{{.Name}} ({{.Status}}){{end}}' 2>/dev/null || echo "无容器连接"
else
    echo "❌ api-proxy-network 网络未创建"
fi

# 检查MySQL详细状态
echo ""
echo "🗄️ MySQL服务状态:"
if docker-compose -f docker-compose-base-service.yml ps | grep -q "api-proxy-mysql.*Up"; then
    echo "✅ MySQL容器运行中"

    # 测试连接
    if docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysqladmin ping -h localhost -u oauth2_user -poauth2_password_123456 2>/dev/null; then
        echo "✅ MySQL数据库连接正常"

        # 检查数据库和表
        echo "📊 数据库信息:"
        docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 -e "SHOW DATABASES;" 2>/dev/null
        echo ""

        echo "📋 表结构:"
        docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;" 2>/dev/null || echo "无表"

        # 检查数据量
        echo "📈 数据统计:"
        docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "
            SELECT
                'clients' as table_name,
                COUNT(*) as record_count,
                ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
            FROM information_schema.tables
            WHERE table_schema = 'oauth2_mock'
            GROUP BY table_name
            ORDER BY table_name;
        " 2>/dev/null || echo "无法获取数据统计"
    else
        echo "❌ MySQL数据库连接失败"
        echo "📋 最近错误日志:"
        docker-compose -f docker-compose-base-service.yml logs api-proxy-mysql | tail -10
    fi
else
    echo "❌ MySQL容器未运行"
fi

# 检查Redis详细状态
echo ""
echo "💾 Redis服务状态:"
if docker-compose -f docker-compose-base-service.yml ps | grep -q "api-proxy-redis.*Up"; then
    echo "✅ Redis容器运行中"

    # 测试连接
    if docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 ping 2>/dev/null; then
        echo "✅ Redis缓存连接正常"

        # 获取Redis信息
        echo "📊 Redis信息:"
        docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 info server 2>/dev/null | head -10
        echo ""

        echo "📈 内存使用:"
        docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 info memory 2>/dev/null | grep -E "(used_memory|maxmemory)"
    else
        echo "❌ Redis缓存连接失败"
        echo "📋 最近错误日志:"
        docker-compose -f docker-compose-base-service.yml logs api-proxy-redis | tail -5
    fi
else
    echo "❌ Redis容器未运行"
fi

# 检查磁盘使用情况
echo ""
echo "💾 磁盘使用情况:"
if [ -d "mysql-data" ]; then
    mysql_size=$(du -sh mysql-data 2>/dev/null | cut -f1)
    echo "   MySQL数据: $mysql_size"
fi

if [ -d "redis-data" ]; then
    redis_size=$(du -sh redis-data 2>/dev/null | cut -f1)
    echo "   Redis数据: $redis_size"
fi

# 健康检查总结
echo ""
echo "🏥 健康检查总结:"
services_ok=0
total_services=2

# MySQL健康检查
if docker-compose -f docker-compose-base-service.yml ps | grep -q "api-proxy-mysql.*Up" && docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysqladmin ping -h localhost -u oauth2_user -poauth2_password_123456 2>/dev/null; then
    echo "   ✅ MySQL: 健康"
    ((services_ok++))
else
    echo "   ❌ MySQL: 异常"
fi

# Redis健康检查
if docker-compose -f docker-compose-base-service.yml ps | grep -q "api-proxy-redis.*Up" && docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 ping 2>/dev/null; then
    echo "   ✅ Redis: 健康"
    ((services_ok++))
else
    echo "   ❌ Redis: 异常"
fi

echo ""
echo "📊 服务健康率: $services_ok/$total_services"

if [ $services_ok -eq $total_services ]; then
    echo "🎉 所有基础服务运行正常！"
    exit 0
else
    echo "⚠️  部分服务存在问题，请检查上述日志"
    exit 1
fi