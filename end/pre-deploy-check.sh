#!/bin/bash

echo "🔍 部署前检查清单"
echo "=================="

cd "$(dirname "$0")"

# 检查文件存在性
echo "📁 检查必要文件..."

files_to_check=(
    "docker-compose.yml"
    "nodejs/docker-compose.yml"
    "nodejs/Dockerfile"
    "nodejs/package.json"
    "database/schema.sql"
    "nginx/conf.d/gemini-proxy.conf"
)

for file in "${files_to_check[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file - 文件不存在"
    fi
done

# 检查目录存在性
echo ""
echo "📂 检查目录结构..."

dirs_to_check=(
    "mysql-data"
    "redis-data"
    "logs/oauth2"
    "tmp/oauth2"
    "client/google_server_account"
    "nodejs/server"
)

for dir in "${dirs_to_check[@]}"; do
    if [ -d "$dir" ]; then
        echo "✅ $dir"
    else
        echo "⚠️  $dir - 目录不存在（部署时会自动创建）"
    fi
done

# 检查配置文件语法
echo ""
echo "🔧 检查配置文件语法..."

# 检查主docker-compose.yml
if docker-compose config > /dev/null 2>&1; then
    echo "✅ 主项目docker-compose.yml语法正确"
else
    echo "❌ 主项目docker-compose.yml语法错误"
    echo "错误详情："
    docker-compose config
fi

# 检查Node.js docker-compose.yml
cd nodejs
if docker-compose config > /dev/null 2>&1; then
    echo "✅ Node.js项目docker-compose.yml语法正确"
else
    echo "❌ Node.js项目docker-compose.yml语法错误"
    echo "错误详情："
    docker-compose config
fi

cd ..

# 检查package.json
echo ""
echo "📦 检查Node.js依赖..."
if [ -f "nodejs/package.json" ]; then
    echo "✅ package.json存在"

    # 检查关键依赖
    key_deps=(
        "express"
        "mysql2"
        "redis"
        "jsonwebtoken"
        "cors"
        "helmet"
        "winston"
    )

    for dep in "${key_deps[@]}"; do
        if grep -q "\"$dep\"" nodejs/package.json; then
            echo "✅ 依赖 $dep"
        else
            echo "❌ 缺少依赖 $dep"
        fi
    done
else
    echo "❌ package.json不存在"
fi

# 检查数据库脚本
echo ""
echo "🗄️  检查数据库脚本..."
if [ -f "database/schema.sql" ]; then
    # 检查关键表
    key_tables=(
        "token_mappings"
        "service_accounts"
        "access_tokens"
        "refresh_tokens"
        "clients"
    )

    for table in "${key_tables[@]}"; do
        if grep -qi "CREATE TABLE.*$table" database/schema.sql; then
            echo "✅ 表 $table"
        else
            echo "❌ 缺少表 $table"
        fi
    done
else
    echo "❌ 数据库脚本不存在"
fi

# 检查Nginx配置
echo ""
echo "🌐 检查Nginx配置..."
if [ -f "nginx/conf.d/gemini-proxy.conf" ]; then
    # 检查关键配置
    key_configs=(
        "api-proxy-nodejs:8889"
        "oauth2.googleapis.com/token"
        "www.googleapis.com/oauth2/v1/certs"
    )

    for config in "${key_configs[@]}"; do
        if grep -q "$config" nginx/conf.d/gemini-proxy.conf; then
            echo "✅ 配置 $config"
        else
            echo "❌ 缺少配置 $config"
        fi
    done
else
    echo "❌ Nginx配置文件不存在"
fi

# 检查Docker环境
echo ""
echo "🐳 检查Docker环境..."
if command -v docker &> /dev/null; then
    echo "✅ Docker已安装"

    if docker info &> /dev/null; then
        echo "✅ Docker服务运行中"
    else
        echo "❌ Docker服务未运行"
    fi

    if command -v docker-compose &> /dev/null; then
        echo "✅ Docker Compose已安装"
    else
        echo "❌ Docker Compose未安装"
    fi
else
    echo "❌ Docker未安装"
fi

# 端口检查
echo ""
echo "🔌 检查端口占用..."
ports_to_check=(
    "8888:主代理服务"
    "8889:OAuth2服务"
    "3306:MySQL数据库"
    "6379:Redis缓存"
)

for port_info in "${ports_to_check[@]}"; do
    port=$(echo $port_info | cut -d: -f1)
    service=$(echo $port_info | cut -d: -f2)

    if netstat -tuln 2>/dev/null | grep -q ":$port "; then
        echo "⚠️  端口 $port ($service) 已被占用"
    else
        echo "✅ 端口 $port ($service) 可用"
    fi
done

# 系统资源检查
echo ""
echo "💾 检查系统资源..."
if command -v df &> /dev/null; then
    echo "磁盘使用情况："
    df -h | head -1
    df -h | grep -E "/$|/home"
fi

if command -v free &> /dev/null; then
    echo "内存使用情况："
    free -h
fi

echo ""
echo "🎉 检查完成！"
echo ""
echo "如果所有检查项都通过，可以安全运行部署脚本："
echo "  bash deploy.sh"
echo ""
echo "如果有错误，请先修复后再部署。"