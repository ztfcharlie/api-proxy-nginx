#!/bin/bash

echo "===== Simple OAuth2 Test (No Docker Commands) ====="
echo "Testing OAuth2 authentication flow..."
echo ""

echo "1. Testing service availability..."
if curl -s http://localhost:8888/health > /dev/null 2>&1; then
    echo "✓ Service is running on port 8888"
elif curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "✓ Service is running on port 8080"
    PORT=8080
else
    echo "✗ Service not accessible on ports 8888 or 8080"
    echo "Please start the service first"
    exit 1
fi

PORT=${PORT:-8888}
echo "Using port: $PORT"

echo ""
echo "2. Making OAuth2 test request..."
echo "This should trigger OAuth2 authentication and generate debug logs"

response=$(curl -s -w "\nHTTP_CODE:%{http_code}\n" \
  -X POST http://localhost:$PORT/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "Hello OAuth2 test"}]}]}')

echo "Response:"
echo "$response"

echo ""
echo "3. Request completed. Now check the logs manually:"
echo ""
echo "To view OAuth2 debug logs, run:"
echo "  docker logs api-proxy-nginx | grep 'OAuth2-DEBUG'"
echo ""
echo "To view all recent logs, run:"
echo "  docker logs --tail=50 api-proxy-nginx"
echo ""
echo "To view error logs, run:"
echo "  docker logs api-proxy-nginx | grep -i error"
echo ""
echo "===== Test Complete ====="
echo "The OAuth2 authentication should have been triggered."
echo "Check the container logs for detailed OAuth2 debug information."