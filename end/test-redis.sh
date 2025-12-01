#!/bin/bash

# Redis连接测试脚本

echo "=== Testing Redis Connection ==="

# 1. 检查Redis容器状态
echo "1. Checking Redis container status..."
docker-compose ps api-proxy-redis

echo ""
echo "2. Testing Redis connection without password..."
docker-compose exec -T api-proxy-redis redis-cli ping 2>/dev/null || echo "Connection failed (expected if password is required)"

echo ""
echo "3. Testing Redis connection with password..."
docker-compose exec -T api-proxy-redis redis-cli -a 123456 ping 2>/dev/null && echo "✓ Redis connection with password successful"

echo ""
echo "4. Testing Redis operations..."
docker-compose exec -T api-proxy-redis redis-cli -a 123456 set test_key "test_value" 2>/dev/null
docker-compose exec -T api-proxy-redis redis-cli -a 123456 get test_key 2>/dev/null
docker-compose exec -T api-proxy-redis redis-cli -a 123456 del test_key 2>/dev/null

echo ""
echo "5. Checking Redis info..."
docker-compose exec -T api-proxy-redis redis-cli -a 123456 info server 2>/dev/null | head -10

echo ""
echo "6. Testing from nginx container..."
echo "Testing Redis connection from nginx container..."
docker-compose exec -T api-proxy-nginx nc -z api-proxy-redis 6379 && echo "✓ Network connection to Redis successful" || echo "✗ Network connection failed"

echo ""
echo "=== Redis Test Complete ==="