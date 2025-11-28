#!/bin/bash

echo "=== 测试简化版 API 代理 ==="
echo ""

# 检查配置
echo "1. 检查配置..."
if [ ! -f .env ]; then
    echo "   创建 .env 文件..."
    cp .env.example .env
fi

source .env

if [ -z "$GOOGLE_API_KEY" ] || [ "$GOOGLE_API_KEY" = "your-google-api-key-here" ]; then
    echo "   ⚠️  GOOGLE_API_KEY 未配置，将使用测试模式"
    echo "   请在 .env 文件中设置真实的 Google API key"
else
    echo "   ✅ GOOGLE_API_KEY 已配置"
fi

echo ""

# 构建并启动
echo "2. 构建并启动容器..."
docker-compose down
docker-compose build
if [ $? -eq 0 ]; then
    echo "   ✅ Docker 构建成功"
else
    echo "   ❌ Docker 构建失败"
    exit 1
fi

docker-compose up -d
sleep 5

echo "   容器状态:"
docker-compose ps
echo ""

# 测试健康检查
echo "3. 测试健康检查..."
health_response=$(curl -s http://localhost:8888/health)
if [ "$health_response" = "OK" ]; then
    echo "   ✅ 健康检查通过: $health_response"
else
    echo "   ❌ 健康检查失败: $health_response"
fi
echo ""

# 测试 API 代理
echo "4. 测试 API 代理..."
api_response=$(curl -s -w "HTTP_CODE:%{http_code}" "http://localhost:8888/v1beta/models/gemini-embedding-001:embedContent" \
  -H "x-goog-api-key: test-client-key" \
  -H 'Content-Type: application/json' \
  -d '{"model": "models/gemini-embedding-001", "content": {"parts":[{"text": "test"}]}}')

http_code=$(echo "$api_response" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
response_body=$(echo "$api_response" | sed 's/HTTP_CODE:[0-9]*$//')

echo "   状态码: $http_code"
echo "   响应: $(echo "$response_body" | head -c 200)..."
echo ""

# 检查日志
echo "5. 检查日志..."
sleep 2

if [ -f "logs/proxy_error.log" ]; then
    echo "   错误日志 (最后5行):"
    tail -5 logs/proxy_error.log | sed 's/^/     /'
    echo ""
fi

if [ -f "logs/api_requests.log" ]; then
    echo "   API 请求日志 (最后2行):"
    tail -2 logs/api_requests.log | sed 's/^/     /'
    echo ""
fi

echo "=== 测试完成 ==="
echo ""

if [ "$http_code" = "200" ]; then
    echo "✅ API 代理工作正常！"
elif [ "$http_code" = "400" ] || [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
    echo "⚠️  API 代理正常转发，但 API key 可能无效"
    echo "   请在 .env 文件中设置有效的 GOOGLE_API_KEY"
else
    echo "❌ API 代理可能有问题，请检查日志"
fi

echo ""
echo "查看实时日志: docker logs -f api-proxy-nginx"