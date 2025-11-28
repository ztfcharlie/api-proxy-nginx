#!/bin/bash

# 简化的 Docker 启动脚本

echo "🚀 启动 Gemini API 代理服务..."

# 检查 Docker
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker 未运行，请先启动 Docker 服务"
    echo "📋 在 Windows 上，请确保 Docker Desktop 正在运行"
    exit 1
fi

# 检查 docker-compose.yaml
if [ ! -f "docker-compose.yaml" ]; then
    echo "❌ docker-compose.yaml 文件不存在"
    exit 1
fi

# 检查配置文件
if [ ! -f "lua/config.lua" ] || [ ! -f "nginx.conf" ]; then
    echo "❌ 配置文件缺失，请先运行 ./init.sh"
    exit 1
fi

# 检查并创建必要目录
echo "📁 检查并创建目录..."
mkdir -p logs redis-data ssl html

# 停止现有服务（如果运行）
echo "🛑 停止现有服务..."
docker-compose down 2>/dev/null || true

# 启动服务
echo "🐳 启动服务..."
docker-compose -f docker-compose.yaml up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
echo "🔍 检查服务状态..."
docker-compose ps

# 健康检查
echo "🏥 执行健康检查..."
sleep 5

if curl -f http://localhost:8080/health >/dev/null 2>&1; then
    echo ""
    echo "✅ 服务启动成功！"
    echo ""
    echo "🌐 访问地址:"
    echo "   HTTP:  http://localhost:8080"
    echo "   HTTPS: http://localhost:8443"
    echo ""
    echo "📊 管理端点:"
    echo "   健康检查:  http://localhost:8080/health"
    echo "   服务状态:  http://localhost:8080/status"
    echo "   管理界面:  http://localhost:8080"
    echo ""
    echo "📚 常用命令:"
    echo "   docker-compose ps          # 查看服务状态"
    echo "   docker-compose logs -f     # 查看日志"
    echo "   docker-compose down        # 停止服务"
    echo "   docker-compose restart    # 重启服务"
else
    echo ""
    echo "❌ 服务启动失败或健康检查失败"
    echo ""
    echo "🔍 调试信息:"
    echo "1. 检查服务状态: docker-compose ps"
    echo "2. 查看日志: docker-compose logs api-proxy-nginx"
    echo "3. 检查端口: netstat -tulpn | grep 8080"
    echo "4. 检查配置: docker-compose config"
    echo ""
    echo "🛠️  尝试手动检查:"
    if command -v docker >/dev/null 2>&1; then
        echo "   Docker 命令: docker version"
    else
        echo "   请确保 Docker 正在运行"
    fi

    if command -v docker-compose >/dev/null 2>&1; then
        echo "   Docker Compose 命令: docker-compose --version"
    else
        echo "   请确保 docker-compose 已安装"
    fi

    echo ""
    echo "📖 查看文档: cat README.md"
    exit 1
fi

echo ""
echo "🎉 完成！服务正在运行中..."