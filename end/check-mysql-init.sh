#!/bin/bash

echo "🔍 MySQL初始化检查脚本"
echo "======================"

cd "$(dirname "$0")"

# 1. 检查database目录和文件
echo "📁 检查数据库初始化文件..."

if [ -d "database" ]; then
    echo "✅ database目录存在"
    ls -la database/
else
    echo "❌ database目录不存在，创建目录..."
    mkdir -p database
fi

if [ -f "database/schema.sql" ]; then
    echo "✅ schema.sql存在"
    echo "文件大小: $(wc -l < database/schema.sql) 行"
else
    echo "❌ schema.sql不存在！"
    echo "这是MySQL没有初始化的根本原因。"
fi

# 2. 检查docker-compose.yml中的挂载配置
echo ""
echo "🔧 检查Docker挂载配置..."
cd nodejs

if grep -q "../database:/docker-entrypoint-initdb.d" docker-compose.yml; then
    echo "✅ 数据库初始化脚本挂载配置正确"
else
    echo "❌ 数据库初始化脚本挂载配置缺失"
    echo "应该在docker-compose.yml中添加:"
    echo "  - ../database:/docker-entrypoint-initdb.d:ro"
fi

# 3. 检查MySQL容器状态
echo ""
echo "🐳 检查MySQL容器状态..."
docker-compose ps api-proxy-mysql

if docker-compose ps | grep -q "api-proxy-mysql.*Up"; then
    echo "✅ MySQL容器正在运行"

    # 检查容器内初始化脚本目录
    echo ""
    echo "📂 检查容器内初始化脚本..."
    if docker-compose exec api-proxy-mysql ls /docker-entrypoint-initdb.d/ 2>/dev/null; then
        echo "✅ 初始化脚本已挂载到容器"
    else
        echo "❌ 初始化脚本未挂载到容器或目录为空"
    fi

    # 检查数据库是否已初始化
    echo ""
    echo "🗄️ 检查数据库初始化状态..."
    if docker-compose exec api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;" 2>/dev/null; then
        echo "✅ 数据库已初始化，包含以下表:"
        docker-compose exec api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;" 2>/dev/null
    else
        echo "❌ 数据库未初始化或连接失败"

        # 检查错误日志
        echo ""
        echo "📋 查看MySQL错误日志..."
        docker-compose logs api-proxy-mysql | tail -20
    fi
else
    echo "❌ MySQL容器未运行"
fi

# 4. 提供解决方案
echo ""
echo "💡 解决方案建议:"
echo "1. 如果schema.sql不存在，我已经创建了完整的数据库初始化脚本"
echo "2. 如果MySQL容器数据损坏，运行: bash fix-mysql.sh"
echo "3. 手动初始化数据库:"
echo "   docker-compose down"
echo "   rm -rf ../mysql-data"
echo "   docker-compose up -d"

echo ""
echo "🔄 重新初始化命令:"
echo "cd nodejs && docker-compose down && rm -rf ../mysql-data && docker-compose up -d"

cd ..