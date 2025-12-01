#!/bin/bash

echo "===== OAuth2 Debug Test Script for Ubuntu ====="
echo "This script will start the service and test OAuth2 authentication"
echo ""

echo "1. Starting Docker services..."
docker-compose up -d
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to start Docker services"
    echo "Please make sure Docker is running and you have proper permissions"
    exit 1
fi

echo ""
echo "2. Waiting for services to start..."
sleep 10

echo ""
echo "3. Checking service health..."
health_response=$(curl -s http://localhost:8888/health)
if [ $? -eq 0 ]; then
    echo "✓ Health check passed: $health_response"
else
    echo "⚠ Health check failed, but continuing..."
fi

echo ""
echo "4. Making OAuth2 test request..."
echo "This will trigger OAuth2 authentication and generate debug logs"
curl -v -X POST http://localhost:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "Hello OAuth2 test"}]}]}' 2>&1

echo ""
echo ""
echo "5. Checking OAuth2 debug logs..."
echo "Looking for [OAuth2-DEBUG] entries..."
oauth_logs=$(docker logs api-proxy-nginx 2>&1 | grep "OAuth2-DEBUG")
if [ -n "$oauth_logs" ]; then
    echo "✓ Found OAuth2 debug logs:"
    echo "$oauth_logs"
else
    echo "⚠ No OAuth2-DEBUG logs found"
fi

echo ""
echo "6. Checking recent error logs..."
error_logs=$(docker logs api-proxy-nginx 2>&1 | grep -i -E "(error|failed|exception)" | tail -10)
if [ -n "$error_logs" ]; then
    echo "Recent errors:"
    echo "$error_logs"
else
    echo "No recent errors found"
fi

echo ""
echo "7. Checking all recent logs (last 30 lines)..."
echo "=== Recent Container Logs ==="
docker logs --tail=30 api-proxy-nginx 2>&1

echo ""
echo "8. Container status check..."
echo "=== Container Status ==="
docker ps | grep api-proxy

echo ""
echo "===== Test Complete ====="
echo ""
echo "Analysis:"
echo "- If you see OAuth2-DEBUG logs above, the authentication process is working"
echo "- If you don't see OAuth2-DEBUG logs, check service configuration and client mapping"
echo "- Look for JWT assertion details and Google API response codes"
echo "- Check for 'invalid_grant' or 'invalid_signature' errors in the response"
echo ""