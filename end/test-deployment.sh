#!/bin/bash

# API Proxy Service 部署测试脚本

set -e

echo "Testing API Proxy Service Deployment..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_service() {
    local service_name="$1"
    local test_command="$2"
    local expected_result="$3"

    echo -n "Testing $service_name... "

    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        return 1
    fi
}

# 测试 URL 响应
test_url() {
    local url="$1"
    local expected_status="$2"
    local description="$3"

    echo -n "Testing $description ($url)... "

    local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

    if [ "$status" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS (HTTP $status)${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL (HTTP $status, expected $expected_status)${NC}"
        return 1
    fi
}

echo "=== Docker Environment Check ==="

# 检查 Docker
test_service "Docker" "docker --version" || {
    echo -e "${RED}ERROR: Docker is not installed or not accessible${NC}"
    exit 1
}

# 检查 Docker Compose
test_service "Docker Compose" "docker-compose --version" || {
    echo -e "${RED}ERROR: Docker Compose is not installed or not accessible${NC}"
    exit 1
}

echo ""
echo "=== Service Status Check ==="

# 检查服务是否运行
test_service "API Proxy Container" "docker-compose ps api-proxy-nginx | grep -q 'Up'" || {
    echo -e "${YELLOW}WARNING: API Proxy container is not running${NC}"
    echo "Try: docker-compose up -d"
}

test_service "Redis Container" "docker-compose ps redis | grep -q 'Up'" || {
    echo -e "${YELLOW}WARNING: Redis container is not running${NC}"
    echo "Try: docker-compose up -d"
}

echo ""
echo "=== Network Connectivity Check ==="

# 检查端口是否开放
test_service "Port 8888 (HTTP)" "nc -z localhost 8888" || {
    echo -e "${YELLOW}WARNING: Port 8888 is not accessible${NC}"
}

test_service "Port 6379 (Redis)" "nc -z localhost 6379" || {
    echo -e "${YELLOW}WARNING: Port 6379 is not accessible${NC}"
}

echo ""
echo "=== API Endpoint Tests ==="

# 测试健康检查端点
test_url "http://localhost:8888/health" "200" "Health Check Endpoint"

# 测试状态端点
test_url "http://localhost:8888/status" "200" "Status Endpoint"

# 测试不存在的端点（应该返回 404）
test_url "http://localhost:8888/nonexistent" "404" "Non-existent Endpoint"

echo ""
echo "=== Configuration File Check ==="

# 检查配置文件
CONFIG_FILES=(
    "config/app_config.json"
    "data/map/map-config.json"
    "nginx/nginx.conf"
    "nginx/conf.d/gemini-proxy.conf"
)

for config_file in "${CONFIG_FILES[@]}"; do
    if [ -f "$config_file" ]; then
        echo -e "Config file $config_file: ${GREEN}✓ EXISTS${NC}"

        # 检查 JSON 文件语法
        if [[ "$config_file" == *.json ]]; then
            if python3 -m json.tool "$config_file" > /dev/null 2>&1 || jq . "$config_file" > /dev/null 2>&1; then
                echo -e "  JSON syntax: ${GREEN}✓ VALID${NC}"
            else
                echo -e "  JSON syntax: ${RED}✗ INVALID${NC}"
            fi
        fi
    else
        echo -e "Config file $config_file: ${RED}✗ MISSING${NC}"
    fi
done

echo ""
echo "=== Lua Module Check ==="

# 检查 Lua 模块文件
LUA_MODULES=(
    "lua/config.lua"
    "lua/auth_manager.lua"
    "lua/utils.lua"
    "lua/stream_handler.lua"
)

for lua_file in "${LUA_MODULES[@]}"; do
    if [ -f "$lua_file" ]; then
        echo -e "Lua module $lua_file: ${GREEN}✓ EXISTS${NC}"
    else
        echo -e "Lua module $lua_file: ${RED}✗ MISSING${NC}"
    fi
done

echo ""
echo "=== Service Logs Check ==="

# 检查最近的错误日志
echo "Recent error logs (if any):"
if docker-compose logs --tail=5 api-proxy-nginx 2>/dev/null | grep -i error; then
    echo -e "${YELLOW}Found error logs above${NC}"
else
    echo -e "${GREEN}No recent errors found${NC}"
fi

echo ""
echo "=== Test Summary ==="

# 获取服务状态
if curl -f -s http://localhost:8888/health > /dev/null 2>&1; then
    echo -e "Overall Status: ${GREEN}✓ HEALTHY${NC}"
    echo ""
    echo "Service is ready for use!"
    echo ""
    echo "Available endpoints:"
    echo "  - Health Check: http://localhost:8888/health"
    echo "  - Status: http://localhost:8888/status"
    echo "  - API Proxy: http://localhost:8888/v1/projects/.../models/..."
    echo ""
    echo "To test API proxy, you need to:"
    echo "1. Add your Google service account JSON files to data/json/"
    echo "2. Configure client tokens in data/map/map-config.json"
    echo "3. Use the test-api.sh script with proper credentials"
else
    echo -e "Overall Status: ${RED}✗ UNHEALTHY${NC}"
    echo ""
    echo "Service is not ready. Check the logs:"
    echo "  docker-compose logs -f api-proxy-nginx"
    echo ""
    echo "Common issues:"
    echo "1. Configuration files missing or invalid"
    echo "2. Service account credentials not configured"
    echo "3. Port conflicts"
    echo "4. Docker/Docker Compose not running"
fi

echo ""
echo "Test completed."