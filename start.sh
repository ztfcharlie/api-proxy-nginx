#!/bin/bash

# 快速启动脚本

echo "🚀 启动 Gemini API 代理..."

# 检查配置文件
if [ ! -f "lua/config.lua" ] || [ ! -f "nginx.conf" ]; then
    echo "❌ 配置文件缺失，请先运行 ./init.sh"
    exit 1
fi

# 检查docker-compose.yaml文件
if [ ! -f "docker-compose.yaml" ]; then
    echo "❌ docker-compose.yaml 文件不存在"
    exit 1
fi

# 检查Docker是否运行
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker 未运行，请先启动 Docker 服务"
    exit 1
fi

# 检查docker-compose是否可用
if ! docker-compose --version >/dev/null 2>&1; then
    echo "❌ docker-compose 未安装或不可用"
    exit 1
fi

# 启动服务
echo "📦 启动 Docker Compose 服务..."
docker-compose -f docker-compose.yaml up -d

# 检查启动状态
if [ $? -eq 0 ]; then
    echo "✅ 服务启动完成"
    echo "🌐 访问地址:"
    echo "   HTTP: http://localhost:8080"
    echo "   HTTPS: http://localhost:8443"
    echo "📊 健康检查:"
    echo "   curl http://localhost:8080/health"
    echo ""
    echo "💡 管理命令:"
    echo "   make status  # 查看服务状态"
    echo "   make logs    # 查看日志"
    echo "   make reload  # 重新加载配置"
else
    echo "❌ 服务启动失败"
    echo "🔍 请检查:"
    echo "   1. Docker 是否正在运行"
    echo "   2. docker-compose.yaml 是否存在"
    echo "   3. 端口是否被占用: netstat -tulpn | grep 8080"
    echo "   4. 运行调试模式: docker-compose -f docker-compose.yaml up --build"
    exit 1
fi