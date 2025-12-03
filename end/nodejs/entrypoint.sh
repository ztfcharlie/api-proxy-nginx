#!/bin/bash

set -e

echo "🔧 Node.js OAuth2 服务启动脚本"
echo "================================"

# 检查并创建必要的目录
echo "📁 检查目录权限和结构..."

# 需要创建的目录列表
directories=(
    "/app/logs"
    "/app/tmp"
    "/app/client"
    "/app/client/google_server_account"
    "/app/map"
)

# 尝试创建目录，如果失败则警告
for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
        echo "   尝试创建目录: $dir"
        mkdir -p "$dir" 2>/dev/null || echo "   ⚠️ 无法创建目录 $dir（可能是权限问题，但目录已挂载）"
    fi

    # 检查目录是否可写
    if [ -d "$dir" ] && [ ! -w "$dir" ]; then
        echo "   ⚠️ 目录 $dir 不可写，但这可能是正常的（如果目录是挂载的）"
    elif [ -d "$dir" ]; then
        echo "   ✅ 目录 $dir 可用"
    fi
done

# 设置环境变量（如果未设置）
export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-8889}

echo ""
echo "🚀 启动Node.js应用..."
echo "   NODE_ENV: $NODE_ENV"
echo "   PORT: $PORT"
echo "   用户ID: $(id -u)"
echo "   用户组: $(id -g)"
echo "   工作目录: $(pwd)"

# 启动应用
exec "$@"