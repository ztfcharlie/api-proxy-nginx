#!/bin/bash

echo "=== 快速测试 HMAC 模块 ==="
echo ""

# 清理并构建
echo "1. 清理并构建..."
docker-compose down
docker-compose build --no-cache

if [ $? -ne 0 ]; then
    echo "   ❌ 构建失败"
    exit 1
fi

echo "   ✅ 构建成功"
echo ""

# 启动容器
echo "2. 启动容器..."
docker-compose up -d
sleep 3

# 检查错误
echo "3. 检查启动错误..."
if docker logs api-proxy-nginx 2>&1 | grep -q "module.*not found"; then
    echo "   ❌ 仍有模块错误:"
    docker logs api-proxy-nginx 2>&1 | grep "module.*not found"

    echo ""
    echo "   检查安装的模块:"
    docker exec api-proxy-nginx ls -la /usr/local/openresty/lualib/resty/ | grep -E "(http|jwt|hmac|string)"

    exit 1
else
    echo "   ✅ 没有模块加载错误"
fi

# 测试健康检查
echo ""
echo "4. 测试健康检查..."
health=$(curl -s http://localhost:8888/health)
if [ "$health" = "OK" ]; then
    echo "   ✅ 健康检查通过: $health"
    echo ""
    echo "🎉 所有模块加载成功！"
    echo ""
    echo "下一步:"
    echo "1. 配置服务账号: cp service-account.json.example service-account.json"
    echo "2. 测试 OAuth2: ./test-oauth2.sh"
else
    echo "   ❌ 健康检查失败: $health"
    echo "   容器日志:"
    docker logs api-proxy-nginx --tail=10
fi