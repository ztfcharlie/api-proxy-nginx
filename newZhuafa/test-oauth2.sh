#!/bin/bash

echo "=== 测试 OAuth2 认证功能 ==="
echo ""

# 检查服务账号配置
echo "1. 检查服务账号配置..."

# 检查 JSON 文件
if [ -f "service-account.json" ]; then
    echo "   ✅ 找到 service-account.json 文件"

    # 检查 JSON 文件内容
    if grep -q "your-project-id" service-account.json; then
        echo "   ⚠️  service-account.json 文件似乎还是模板内容，请替换为真实的 Vertex AI JSON key"
    else
        echo "   ✅ service-account.json 文件内容已配置"
    fi
else
    echo "   ❌ service-account.json 文件不存在"
    echo "   请复制 service-account.json.example 到 service-account.json 并填入你的 Vertex AI JSON key"

    # 检查环境变量作为备选
    if [ -f .env ]; then
        source .env
        if [ -n "$GOOGLE_CLIENT_EMAIL" ] && [ "$GOOGLE_CLIENT_EMAIL" != "your-service-account@your-project.iam.gserviceaccount.com" ]; then
            echo "   ✅ 找到环境变量配置作为备选"
        else
            echo "   ❌ 环境变量也未正确配置"
            echo "   请配置 service-account.json 文件或 .env 环境变量"
            exit 1
        fi
    else
        echo "   ❌ .env 文件也不存在"
        exit 1
    fi
fi

echo "   服务账号配置检查完成"
echo ""

# 构建并启动容器
echo "2. 构建并启动容器..."
docker-compose down
docker-compose build --no-cache
docker-compose up -d
echo "   等待容器启动..."
sleep 10
echo ""

# 检查容器状态
echo "3. 检查容器状态..."
docker-compose ps
echo ""

# 检查容器日志
echo "4. 检查启动日志..."
docker logs api-proxy-nginx --tail=20
echo ""

# 测试健康检查
echo "5. 测试健康检查..."
curl -s http://localhost:8888/health
echo ""
echo "   健康检查完成"
echo ""

# 测试 OAuth2 认证
echo "6. 测试 OAuth2 认证..."
response=$(curl -s "http://localhost:8888/v1beta/models/gemini-embedding-001:embedContent" \
  -H "x-goog-api-key: test-client-key" \
  -H 'Content-Type: application/json' \
  -d '{"model": "models/gemini-embedding-001", "content": {"parts":[{"text": "test"}]}}')

echo "   API 响应:"
echo "$response" | head -10
echo ""

# 等待日志写入
sleep 2

# 检查日志
echo "7. 检查最新日志..."
echo ""

if [ -f "logs/proxy_error.log" ]; then
    echo "=== 错误日志 (最后10行) ==="
    tail -10 logs/proxy_error.log
    echo ""
fi

if [ -f "logs/api_requests.log" ]; then
    echo "=== API 请求日志 (最后3行) ==="
    tail -3 logs/api_requests.log | jq . 2>/dev/null || tail -3 logs/api_requests.log
    echo ""
fi

if [ -f "logs/requests.log" ]; then
    echo "=== 自定义请求日志 (最后3行) ==="
    tail -3 logs/requests.log
    echo ""
fi

echo "=== OAuth2 测试完成 ==="
echo ""
echo "如果看到认证错误，请检查:"
echo "1. .env 文件中的服务账号配置是否正确"
echo "2. 服务账号是否有 Generative Language API 权限"
echo "3. 项目是否启用了 Generative Language API"
echo ""
echo "查看实时日志: docker logs -f api-proxy-nginx"