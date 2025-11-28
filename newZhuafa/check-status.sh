#!/bin/bash

echo "=== 检查容器状态和功能 ==="
echo ""

# 检查容器状态
echo "1. 检查容器状态..."
container_status=$(docker-compose ps --services --filter "status=running")
if [[ $container_status == *"api-proxy-nginx"* ]]; then
    echo "   ✅ 容器正在运行"
else
    echo "   ❌ 容器未运行"
    echo "   容器状态:"
    docker-compose ps
    exit 1
fi
echo ""

# 检查进程
echo "2. 检查 Nginx 进程..."
nginx_processes=$(docker exec api-proxy-nginx ps aux | grep nginx | grep -v grep | wc -l)
if [ "$nginx_processes" -gt 0 ]; then
    echo "   ✅ Nginx 进程正在运行 ($nginx_processes 个进程)"
else
    echo "   ❌ Nginx 进程未运行"
    docker exec api-proxy-nginx ps aux
fi
echo ""

# 检查端口监听
echo "3. 检查端口监听..."
port_listening=$(docker exec api-proxy-nginx netstat -tlnp 2>/dev/null | grep :8080 | wc -l)
if [ "$port_listening" -gt 0 ]; then
    echo "   ✅ 端口 8080 正在监听"
else
    echo "   ❌ 端口 8080 未监听"
    docker exec api-proxy-nginx netstat -tlnp 2>/dev/null || echo "   netstat 不可用"
fi
echo ""

# 测试健康检查
echo "4. 测试健康检查..."
health_response=$(curl -s -w "HTTP_CODE:%{http_code}" http://localhost:8888/health)
http_code=$(echo "$health_response" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
response_body=$(echo "$health_response" | sed 's/HTTP_CODE:[0-9]*$//')

echo "   状态码: $http_code"
echo "   响应: $response_body"

if [ "$http_code" = "200" ] && [ "$response_body" = "OK" ]; then
    echo "   ✅ 健康检查通过"
else
    echo "   ❌ 健康检查失败"
fi
echo ""

# 检查日志中的错误和警告
echo "5. 检查日志..."
echo "   错误 (errors):"
error_count=$(docker logs api-proxy-nginx 2>&1 | grep -i "error" | wc -l)
if [ "$error_count" -gt 0 ]; then
    echo "     发现 $error_count 个错误:"
    docker logs api-proxy-nginx 2>&1 | grep -i "error" | head -3
else
    echo "     ✅ 没有错误"
fi

echo ""
echo "   警告 (warnings):"
warning_count=$(docker logs api-proxy-nginx 2>&1 | grep -i "warn" | wc -l)
if [ "$warning_count" -gt 0 ]; then
    echo "     发现 $warning_count 个警告:"
    docker logs api-proxy-nginx 2>&1 | grep -i "warn" | head -2
    echo "     ℹ️  mTLS 警告是正常的，不影响基本功能"
else
    echo "     ✅ 没有警告"
fi
echo ""

# 测试 API 端点
echo "6. 测试 API 端点..."
api_response=$(curl -s -w "HTTP_CODE:%{http_code}" "http://localhost:8888/v1beta/models/test" \
  -H "x-goog-api-key: test-key" \
  -H 'Content-Type: application/json' \
  -d '{"test": "data"}')

api_code=$(echo "$api_response" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
echo "   API 测试状态码: $api_code"

if [ "$api_code" = "401" ]; then
    echo "   ✅ API 端点正常 (401 是预期的，因为没有配置真实服务账号)"
elif [ "$api_code" = "500" ]; then
    echo "   ❌ API 端点有内部错误"
    echo "   最新错误日志:"
    docker logs api-proxy-nginx --tail=5 2>&1 | grep -i error
else
    echo "   ℹ️  API 端点返回状态码: $api_code"
fi
echo ""

# 总结
echo "=== 状态总结 ==="
if [ "$http_code" = "200" ] && [ "$response_body" = "OK" ]; then
    echo "✅ 容器启动成功"
    echo "✅ 基本功能正常"

    if [ "$warning_count" -gt 0 ]; then
        echo "⚠️  有警告但不影响功能 (mTLS 相关)"
    fi

    echo ""
    echo "🎉 系统可以正常使用！"
    echo ""
    echo "下一步:"
    echo "1. 配置服务账号: cp service-account.json.example service-account.json"
    echo "2. 编辑服务账号文件并粘贴你的 Vertex AI JSON key"
    echo "3. 测试 OAuth2: ./test-oauth2.sh"
else
    echo "❌ 系统有问题，需要检查日志"
    echo ""
    echo "完整日志:"
    docker logs api-proxy-nginx
fi