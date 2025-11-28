#!/bin/bash

echo "=== 测试 Docker 构建和模块加载 ==="
echo ""

# 清理旧容器
echo "1. 清理旧容器..."
docker-compose down
docker system prune -f
echo ""

# 构建镜像
echo "2. 构建 Docker 镜像..."
docker-compose build --no-cache
if [ $? -eq 0 ]; then
    echo "   ✅ Docker 构建成功"
else
    echo "   ❌ Docker 构建失败"
    exit 1
fi
echo ""

# 启动容器
echo "3. 启动容器..."
docker-compose up -d
sleep 5

# 检查容器状态
echo "4. 检查容器状态..."
container_status=$(docker-compose ps --services --filter "status=running")
if [[ $container_status == *"api-proxy-nginx"* ]]; then
    echo "   ✅ 容器启动成功"
else
    echo "   ❌ 容器启动失败"
    echo "   容器状态:"
    docker-compose ps
    echo ""
    echo "   错误日志:"
    docker logs api-proxy-nginx
    exit 1
fi
echo ""

# 检查 Lua 模块加载
echo "5. 检查 Lua 模块加载..."
echo "   查找模块加载相关日志:"
docker logs api-proxy-nginx 2>&1 | grep -E "(error|Error|ERROR)" | head -5

if docker logs api-proxy-nginx 2>&1 | grep -q "module.*not found"; then
    echo "   ❌ 仍有模块加载错误"
    echo "   详细错误:"
    docker logs api-proxy-nginx 2>&1 | grep "module.*not found"
else
    echo "   ✅ 没有发现模块加载错误"
fi
echo ""

# 测试健康检查
echo "6. 测试健康检查..."
health_response=$(curl -s http://localhost:8888/health)
if [ "$health_response" = "OK" ]; then
    echo "   ✅ 健康检查通过: $health_response"
else
    echo "   ❌ 健康检查失败: $health_response"
fi
echo ""

# 检查服务账号验证
echo "7. 检查服务账号验证..."
if docker logs api-proxy-nginx 2>&1 | grep -q "Service account.*validated successfully"; then
    echo "   ✅ 服务账号配置验证成功"
elif docker logs api-proxy-nginx 2>&1 | grep -q "Service account.*failed"; then
    echo "   ⚠️  服务账号配置验证失败 (这是正常的，因为还没有配置真实的服务账号)"
else
    echo "   ⚠️  没有找到服务账号验证日志"
fi
echo ""

# 显示完整日志
echo "8. 显示启动日志 (最后20行)..."
docker logs api-proxy-nginx --tail=20
echo ""

echo "=== 构建测试完成 ==="

if [ "$health_response" = "OK" ]; then
    echo "✅ 构建和基本功能测试通过"
    echo "   现在可以配置服务账号并测试 OAuth2 功能"
else
    echo "❌ 构建测试失败，请检查上面的错误信息"
fi

echo ""
echo "下一步:"
echo "1. 配置服务账号: cp service-account.json.example service-account.json"
echo "2. 测试 OAuth2: ./test-oauth2.sh"
echo "3. 测试缓存: ./test-token-cache.sh"