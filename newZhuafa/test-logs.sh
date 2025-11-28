#!/bin/bash

echo "=== 测试日志功能 ==="
echo ""

# 清理旧日志
echo "1. 清理旧日志文件..."
rm -f logs/*.log
echo "   日志文件已清理"
echo ""

# 重启容器
echo "2. 重启容器..."
docker-compose down
docker-compose up -d
sleep 5
echo "   容器已重启"
echo ""

# 测试健康检查
echo "3. 测试健康检查..."
curl -s http://localhost:8888/health
echo ""
echo "   健康检查完成"
echo ""

# 测试 404 请求
echo "4. 测试 404 请求..."
curl -s http://localhost:8888/nonexistent
echo ""
echo "   404 请求完成"
echo ""

# 测试 API 请求（会失败，但会生成日志）
echo "5. 测试 API 请求..."
curl -s "http://localhost:8888/v1beta/models/gemini-embedding-001:embedContent" \
  -H "x-goog-api-key: test-key" \
  -H 'Content-Type: application/json' \
  -d '{"model": "models/gemini-embedding-001", "content": {"parts":[{"text": "test"}]}}'
echo ""
echo "   API 请求完成"
echo ""

# 等待日志写入
sleep 2

# 检查日志文件
echo "6. 检查生成的日志文件..."
echo "   日志目录内容:"
ls -la logs/
echo ""

# 显示各种日志内容
if [ -f "logs/proxy_access.log" ]; then
    echo "=== Proxy Access Log ==="
    cat logs/proxy_access.log
    echo ""
fi

if [ -f "logs/api_requests.log" ]; then
    echo "=== API Requests Log (JSON) ==="
    cat logs/api_requests.log
    echo ""
fi

if [ -f "logs/requests.log" ]; then
    echo "=== Custom Requests Log ==="
    cat logs/requests.log
    echo ""
fi

if [ -f "logs/proxy_error.log" ]; then
    echo "=== Proxy Error Log ==="
    cat logs/proxy_error.log
    echo ""
fi

echo "=== 测试完成 ==="
echo "现在可以使用 ./view-logs.sh 查看实时日志"