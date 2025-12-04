#!/bin/bash

# CSP修复版Web管理界面部署脚本
# 使用方法: ./deploy-fixed-server.sh

echo "🔧 开始部署CSP修复版Web管理界面..."

# 检查当前目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在Node.js项目根目录运行此脚本"
    exit 1
fi

# 停止当前在8889端口运行的服务
echo "🛑 停止当前运行的服务..."
pkill -f "node.*8889" || echo "没有找到运行中的服务"
sleep 2

# 确保端口已释放
while lsof -i :8889 >/dev/null 2>&1; do
    echo "等待端口8889释放..."
    sleep 1
done
echo "✅ 端口8889已释放"

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 备份当前服务（如果存在）
if [ -f "start-web-demo.js" ]; then
    echo "💾 备份当前服务..."
    cp start-web-demo.js start-web-demo.js.backup.$(date +%Y%m%d_%H%M%S)
fi

# 使用CSP修复版本启动服务
echo "🚀 启动CSP修复版服务..."
nohup node fix-csp-server.js > csp-server.log 2>&1 &
SERVER_PID=$!

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 5

# 检查服务是否正常运行
if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ 服务启动成功! PID: $SERVER_PID"

    # 测试健康检查端点
    echo "🔍 测试服务健康状态..."
    sleep 2

    if curl -s http://localhost:8889/health | grep -q "csp-fixed"; then
        echo "✅ CSP修复版服务运行正常!"
        echo ""
        echo "🎉 部署完成! 访问地址:"
        echo "   📱 本地: http://localhost:8889/admin/"
        echo "   🌐 公网: http://47.239.10.174:8889/admin/"
        echo ""
        echo "🔧 CSP修复功能:"
        echo "   ✅ 移除了Content-Security-Policy限制"
        echo "   ✅ 允许加载外部CDN资源"
        echo "   ✅ React/Tailwind CSS等脚本现在可正常加载"
        echo ""
        echo "📋 服务信息:"
        echo "   📝 日志文件: csp-server.log"
        echo "   🔄 重启服务: ./deploy-fixed-server.sh"
        echo "   🛑 停止服务: pkill -f fix-csp-server.js"
    else
        echo "❌ 服务健康检查失败，请查看日志: csp-server.log"
        kill $SERVER_PID 2>/dev/null
        exit 1
    fi
else
    echo "❌ 服务启动失败，请检查错误信息"
    if [ -f "csp-server.log" ]; then
        echo "错误日志:"
        tail -10 csp-server.log
    fi
    exit 1
fi