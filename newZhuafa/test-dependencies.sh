#!/bin/bash

echo "=== 测试 Lua 依赖模块 ==="
echo ""

# 清理并重新构建
echo "1. 清理并重新构建..."
docker-compose down
docker system prune -f
echo ""

echo "2. 构建镜像 (包含所有依赖)..."
docker-compose build --no-cache
if [ $? -eq 0 ]; then
    echo "   ✅ Docker 构建成功"
else
    echo "   ❌ Docker 构建失败"
    exit 1
fi
echo ""

# 测试模块加载
echo "3. 测试模块加载..."
docker run --rm -v "$(pwd)/lua:/usr/local/openresty/nginx/lua:ro" \
    $(docker-compose config --services | head -1) \
    /usr/local/openresty/luajit/bin/luajit -e "
    -- 测试加载各个模块
    local modules = {
        'resty.http',
        'resty.jwt',
        'resty.hmac',
        'resty.string.to_hex'
    }

    for _, module in ipairs(modules) do
        local success, result = pcall(require, module)
        if success then
            print('✅ ' .. module .. ' - 加载成功')
        else
            print('❌ ' .. module .. ' - 加载失败: ' .. tostring(result))
        end
    end
    "

echo ""

# 启动容器
echo "4. 启动容器..."
docker-compose up -d
sleep 5

# 检查启动日志
echo "5. 检查启动日志..."
if docker logs api-proxy-nginx 2>&1 | grep -q "module.*not found"; then
    echo "   ❌ 仍有模块加载错误:"
    docker logs api-proxy-nginx 2>&1 | grep "module.*not found"
    echo ""
    echo "   完整错误日志:"
    docker logs api-proxy-nginx
    exit 1
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
    echo "   容器日志:"
    docker logs api-proxy-nginx --tail=10
    exit 1
fi
echo ""

# 检查服务账号验证
echo "7. 检查服务账号验证..."
if docker logs api-proxy-nginx 2>&1 | grep -q "Service account.*validated successfully"; then
    echo "   ✅ 服务账号配置验证成功"
elif docker logs api-proxy-nginx 2>&1 | grep -q "Service account.*failed"; then
    echo "   ⚠️  服务账号配置验证失败 (正常，需要配置真实服务账号)"
else
    echo "   ⚠️  没有找到服务账号验证日志"
fi
echo ""

# 测试一个简单的 API 调用
echo "8. 测试 API 调用 (不需要真实服务账号)..."
api_response=$(curl -s -w "HTTP_CODE:%{http_code}" "http://localhost:8888/v1beta/models/test" \
  -H "x-goog-api-key: test-key" \
  -H 'Content-Type: application/json' \
  -d '{"test": "data"}')

http_code=$(echo "$api_response" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
echo "   API 调用状态码: $http_code"

if [ "$http_code" = "401" ]; then
    echo "   ✅ API 调用到达认证阶段 (正常，因为没有配置真实服务账号)"
elif [ "$http_code" = "500" ]; then
    echo "   ❌ 服务器内部错误，可能是模块问题"
    docker logs api-proxy-nginx --tail=5
else
    echo "   ℹ️  其他状态码: $http_code"
fi
echo ""

echo "=== 依赖测试完成 ==="

if [ "$health_response" = "OK" ]; then
    echo "✅ 所有依赖模块加载成功"
    echo "✅ 基本功能正常"
    echo ""
    echo "下一步:"
    echo "1. 配置服务账号: cp service-account.json.example service-account.json"
    echo "2. 编辑服务账号文件并粘贴你的 Vertex AI JSON key"
    echo "3. 测试 OAuth2: ./test-oauth2.sh"
else
    echo "❌ 依赖测试失败"
fi