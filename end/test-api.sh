#!/bin/bash

# API Proxy Service 测试脚本

set -e

echo "Testing API Proxy Service..."

# 基本配置
API_HOST="localhost:8080"
CLIENT_TOKEN="${CLIENT_TOKEN:-demo-client-token}"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_endpoint() {
    local endpoint="$1"
    local expected_status="$2"
    local description="$3"

    echo -n "Testing $description... "

    local response=$(curl -s -w "%{http_code}" -o /tmp/response.json "http://$API_HOST$endpoint" 2>/dev/null || echo "000")
    local status="${response: -3}"

    if [ "$status" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS (HTTP $status)${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL (HTTP $status, expected $expected_status)${NC}"
        if [ -f /tmp/response.json ]; then
            echo "Response: $(cat /tmp/response.json)"
        fi
        return 1
    fi
}

echo "=== Basic Endpoint Tests ==="

# 测试健康检查
test_endpoint "/health" "200" "Health Check"

# 测试状态检查
test_endpoint "/status" "200" "Status Check"

echo ""
echo "=== API Proxy Tests ==="

# 测试无认证的API请求（应该返回401）
echo -n "Testing API without auth... "
response=$(curl -s -w "%{http_code}" -o /tmp/response.json \
    -X POST "http://$API_HOST/v1/projects/test/locations/global/publishers/google/models/gemini-pro:generateContent" \
    -H "Content-Type: application/json" \
    -d '{"contents":[{"parts":[{"text":"test"}]}]}' 2>/dev/null || echo "000")
status="${response: -3}"

if [ "$status" = "401" ]; then
    echo -e "${GREEN}✓ PASS (HTTP $status - Unauthorized as expected)${NC}"
else
    echo -e "${YELLOW}? UNEXPECTED (HTTP $status)${NC}"
fi

# 测试带认证的API请求
echo -n "Testing API with auth... "
response=$(curl -s -w "%{http_code}" -o /tmp/response.json \
    -X POST "http://$API_HOST/v1/projects/test/locations/global/publishers/google/models/gemini-pro:generateContent" \
    -H "Authorization: Bearer $CLIENT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' 2>/dev/null || echo "000")
status="${response: -3}"

case "$status" in
    "200"|"201")
        echo -e "${GREEN}✓ PASS (HTTP $status - Success)${NC}"
        ;;
    "400"|"403"|"404")
        echo -e "${YELLOW}? CONFIG ISSUE (HTTP $status - Check configuration)${NC}"
        echo "This might be expected if service account is not configured"
        ;;
    "500"|"502"|"503")
        echo -e "${YELLOW}? SERVER ISSUE (HTTP $status - Check logs)${NC}"
        ;;
    *)
        echo -e "${RED}✗ FAIL (HTTP $status)${NC}"
        ;;
esac

if [ -f /tmp/response.json ]; then
    echo "Response preview: $(head -c 200 /tmp/response.json)..."
fi

echo ""
echo "=== Configuration Check ==="

# 检查配置文件
if [ -f "/etc/nginx/data/map/map-config.json" ]; then
    echo -e "Configuration file: ${GREEN}✓ EXISTS${NC}"

    # 检查是否有配置的客户端
    if command -v jq >/dev/null 2>&1; then
        client_count=$(jq '.clients | length' /etc/nginx/data/map/map-config.json 2>/dev/null || echo "0")
        echo "Configured clients: $client_count"
    fi
else
    echo -e "Configuration file: ${RED}✗ MISSING${NC}"
    echo "Create /etc/nginx/data/map/map-config.json with client configuration"
fi

# 检查服务账号文件
json_files=$(ls /etc/nginx/data/json/*.json 2>/dev/null | wc -l || echo "0")
echo "Service account files: $json_files"

if [ "$json_files" -eq 0 ]; then
    echo -e "${YELLOW}WARNING: No service account files found in /etc/nginx/data/json/${NC}"
    echo "Add Google Cloud service account JSON files to enable API proxy functionality"
fi

echo ""
echo "=== Test Summary ==="

if curl -f -s "http://$API_HOST/health" >/dev/null 2>&1; then
    echo -e "Service Status: ${GREEN}✓ RUNNING${NC}"
    echo ""
    echo "Next steps to enable full functionality:"
    echo "1. Add Google service account JSON files to data/json/"
    echo "2. Configure client tokens in data/map/map-config.json"
    echo "3. Test with: CLIENT_TOKEN=your-token ./test-api.sh"
else
    echo -e "Service Status: ${RED}✗ NOT RUNNING${NC}"
    echo "Start the service with: docker-compose up -d"
fi

# 清理临时文件
rm -f /tmp/response.json

echo ""
echo "Test completed."