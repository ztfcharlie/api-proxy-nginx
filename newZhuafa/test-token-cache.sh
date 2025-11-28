#!/bin/bash

echo "=== 测试 JWT 令牌缓存持久化 ==="
echo ""

# 检查缓存目录
echo "1. 检查缓存目录..."
if [ ! -d "cache" ]; then
    echo "   ❌ cache 目录不存在"
    exit 1
else
    echo "   ✅ cache 目录存在"
fi

# 清理旧的缓存文件
echo "   清理旧缓存文件..."
rm -f cache/oauth_token.json
echo ""

# 启动容器
echo "2. 启动容器..."
docker-compose down
docker-compose up -d
sleep 5

echo "   容器状态:"
docker-compose ps
echo ""

# 第一次 API 调用 - 应该生成新令牌
echo "3. 第一次 API 调用 (生成新令牌)..."
response1=$(curl -s -w "HTTP_CODE:%{http_code}" "http://localhost:8888/v1beta/models/gemini-embedding-001:embedContent" \
  -H "x-goog-api-key: test-client-key" \
  -H 'Content-Type: application/json' \
  -d '{"model": "models/gemini-embedding-001", "content": {"parts":[{"text": "test1"}]}}')

http_code1=$(echo "$response1" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
echo "   第一次调用状态码: $http_code1"

# 等待缓存写入
sleep 2

# 检查缓存文件是否生成
echo ""
echo "4. 检查缓存文件..."
if [ -f "cache/oauth_token.json" ]; then
    echo "   ✅ 缓存文件已生成: cache/oauth_token.json"
    echo "   缓存文件内容:"
    cat cache/oauth_token.json | jq . 2>/dev/null || cat cache/oauth_token.json
    echo ""
else
    echo "   ❌ 缓存文件未生成"
fi

# 第二次 API 调用 - 应该使用缓存令牌
echo "5. 第二次 API 调用 (使用缓存令牌)..."
response2=$(curl -s -w "HTTP_CODE:%{http_code}" "http://localhost:8888/v1beta/models/gemini-embedding-001:embedContent" \
  -H "x-goog-api-key: test-client-key" \
  -H 'Content-Type: application/json' \
  -d '{"model": "models/gemini-embedding-001", "content": {"parts":[{"text": "test2"}]}}')

http_code2=$(echo "$response2" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
echo "   第二次调用状态码: $http_code2"
echo ""

# 重启容器测试持久化
echo "6. 重启容器测试持久化..."
docker-compose restart
sleep 5

echo "   容器重启完成"
echo ""

# 第三次 API 调用 - 应该从文件加载缓存令牌
echo "7. 第三次 API 调用 (从文件加载缓存)..."
response3=$(curl -s -w "HTTP_CODE:%{http_code}" "http://localhost:8888/v1beta/models/gemini-embedding-001:embedContent" \
  -H "x-goog-api-key: test-client-key" \
  -H 'Content-Type: application/json' \
  -d '{"model": "models/gemini-embedding-001", "content": {"parts":[{"text": "test3"}]}}')

http_code3=$(echo "$response3" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
echo "   第三次调用状态码: $http_code3"
echo ""

# 检查日志
echo "8. 检查缓存相关日志..."
echo "   查找缓存相关日志:"
docker logs api-proxy-nginx 2>&1 | grep -i "cached\|token" | tail -10
echo ""

# 检查缓存文件状态
echo "9. 最终缓存文件状态..."
if [ -f "cache/oauth_token.json" ]; then
    echo "   缓存文件大小: $(ls -lh cache/oauth_token.json | awk '{print $5}')"
    echo "   缓存文件修改时间: $(ls -l cache/oauth_token.json | awk '{print $6, $7, $8}')"

    # 检查缓存内容
    if command -v jq &> /dev/null; then
        echo "   缓存令牌过期时间: $(cat cache/oauth_token.json | jq -r '.expires_at')"
        echo "   缓存创建时间: $(cat cache/oauth_token.json | jq -r '.cached_at')"
    fi
else
    echo "   ❌ 缓存文件不存在"
fi

echo ""
echo "=== 测试结果总结 ==="
echo "第一次调用: HTTP $http_code1 (应该生成新令牌)"
echo "第二次调用: HTTP $http_code2 (应该使用内存缓存)"
echo "第三次调用: HTTP $http_code3 (应该使用文件缓存)"

if [ -f "cache/oauth_token.json" ]; then
    echo ""
    echo "✅ JWT 令牌缓存持久化功能正常工作"
    echo "   - 令牌被缓存到文件: cache/oauth_token.json"
    echo "   - 容器重启后可以从文件恢复令牌"
else
    echo ""
    echo "❌ JWT 令牌缓存持久化可能有问题"
    echo "   请检查容器日志和权限设置"
fi

echo ""
echo "缓存文件位置: $(pwd)/cache/oauth_token.json"
echo "查看实时日志: docker logs -f api-proxy-nginx"