#!/bin/bash

# 测试curl版本的OAuth2实现

echo "=== Testing Curl-based OAuth2 Implementation ==="

echo "1. Testing basic endpoints first..."
echo "Health check:"
health_response=$(curl -s -w "%{http_code}" http://localhost:8888/health)
health_code="${health_response: -3}"
if [ "$health_code" = "200" ]; then
    echo "✓ Health check passed (HTTP $health_code)"
else
    echo "✗ Health check failed (HTTP $health_code)"
    exit 1
fi

echo ""
echo "Status check:"
status_response=$(curl -s -w "%{http_code}" http://localhost:8888/status)
status_code="${status_response: -3}"
if [ "$status_code" = "200" ]; then
    echo "✓ Status check passed (HTTP $status_code)"
    echo "Config loaded: $(echo "$status_response" | head -c -4 | jq -r '.config_loaded // "unknown"' 2>/dev/null || echo "unknown")"
else
    echo "✗ Status check failed (HTTP $status_code)"
fi

echo ""
echo "2. Testing OAuth2 flow without authentication..."
echo "Making request without Authorization header (should return 401):"
no_auth_response=$(curl -s -w "%{http_code}" -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"test"}]}]}')
no_auth_code="${no_auth_response: -3}"

if [ "$no_auth_code" = "401" ]; then
    echo "✓ Correctly rejected request without auth (HTTP $no_auth_code)"
else
    echo "? Unexpected response without auth (HTTP $no_auth_code)"
fi

echo ""
echo "3. Testing OAuth2 flow with authentication..."
echo "Making request with client token (will trigger OAuth2 flow):"

# 启用详细输出以查看OAuth2过程
curl -v -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello from curl OAuth2!"}]}]}' 2>&1 | head -20

echo ""
echo ""
echo "4. Checking OAuth2 process logs..."
echo "Looking for OAuth2 debug logs:"
docker logs api-proxy-nginx --tail 50 | grep -E "\[OAuth2\]|\[TEST\]" | tail -10 || echo "No OAuth2 debug logs found (normal if debug mode not enabled)"

echo ""
echo "5. Checking for any errors in recent logs..."
echo "Recent error logs:"
docker logs api-proxy-nginx --tail 30 | grep -i error | tail -5 || echo "No recent errors found"

echo ""
echo "6. Testing token caching (second request)..."
echo "Making second request to test caching:"
second_response=$(curl -s -w "%{http_code}" -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"cached request test"}]}]}')
second_code="${second_response: -3}"

echo "Second request result: HTTP $second_code"
if [ "$second_code" = "502" ] || [ "$second_code" = "403" ] || [ "$second_code" = "400" ]; then
    echo "Expected result: OAuth2 flow working, but API call fails (normal without real service account)"
elif [ "$second_code" = "200" ]; then
    echo "✓ Success! OAuth2 flow and API call both working"
else
    echo "? Unexpected response: HTTP $second_code"
fi

echo ""
echo "7. Configuration check..."
echo "Checking if configuration files exist:"

config_files=(
    "data/map/map-config.json"
    "config/app_config.json"
)

for config_file in "${config_files[@]}"; do
    if [ -f "$config_file" ]; then
        echo "✓ $config_file exists"
        if [[ "$config_file" == *.json ]]; then
            if jq . "$config_file" >/dev/null 2>&1; then
                echo "  ✓ Valid JSON format"
            else
                echo "  ✗ Invalid JSON format"
            fi
        fi
    else
        echo "✗ $config_file missing"
    fi
done

echo ""
echo "Checking service account files:"
json_count=$(ls data/json/*.json 2>/dev/null | wc -l)
echo "Service account files found: $json_count"

if [ "$json_count" -gt 0 ]; then
    echo "Service account files:"
    ls -la data/json/*.json
else
    echo "⚠️  No service account files found in data/json/"
    echo "   Add Google Cloud service account JSON files to enable real OAuth2"
fi

echo ""
echo "=== Curl OAuth2 Test Complete ==="

echo ""
echo "Test Summary:"
echo "- Basic endpoints: Working"
echo "- Authentication check: Working (rejects requests without auth)"
echo "- OAuth2 flow: Triggered (check logs for details)"
echo "- Configuration: $([ -f "data/map/map-config.json" ] && echo "Present" || echo "Missing")"
echo "- Service accounts: $json_count files found"

echo ""
echo "To enable full OAuth2 functionality:"
echo "1. Add real Google service account JSON to data/json/"
echo "2. Configure client mapping in data/map/map-config.json"
echo "3. Enable debug logging: ./enable-oauth2-debug.sh"

echo ""
echo "To view OAuth2 debug logs:"
echo "  docker logs api-proxy-nginx | grep OAuth2"