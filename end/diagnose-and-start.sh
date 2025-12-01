#!/bin/bash

echo "===== Docker Service Diagnosis and Startup ====="
echo ""

echo "1. Checking Docker service status..."
if systemctl is-active --quiet docker; then
    echo "✓ Docker service is running"
else
    echo "⚠ Docker service is not running, attempting to start..."
    sudo systemctl start docker
    sleep 3
    if systemctl is-active --quiet docker; then
        echo "✓ Docker service started successfully"
    else
        echo "✗ Failed to start Docker service"
        echo "Please run: sudo systemctl start docker"
        exit 1
    fi
fi

echo ""
echo "2. Checking current directory and files..."
pwd
ls -la docker-compose.yml 2>/dev/null || echo "⚠ docker-compose.yml not found in current directory"

echo ""
echo "3. Checking existing containers..."
docker ps -a | grep api-proxy || echo "No api-proxy containers found"

echo ""
echo "4. Stopping any existing containers..."
docker-compose down 2>/dev/null || echo "No containers to stop"

echo ""
echo "5. Starting services..."
docker-compose up -d

echo ""
echo "6. Waiting for services to start..."
sleep 15

echo ""
echo "7. Checking container status..."
docker ps | grep api-proxy

echo ""
echo "8. Checking port availability..."
for port in 8888 8080; do
    if netstat -tlnp 2>/dev/null | grep ":$port " >/dev/null; then
        echo "✓ Port $port is in use"
    else
        echo "⚠ Port $port is not in use"
    fi
done

echo ""
echo "9. Testing health endpoint..."
for port in 8888 8080; do
    echo "Testing port $port..."
    response=$(curl -s -w "HTTP_CODE:%{http_code}" http://localhost:$port/health 2>/dev/null)
    if echo "$response" | grep -q "HTTP_CODE:200"; then
        echo "✓ Health check passed on port $port"
        WORKING_PORT=$port
        break
    else
        echo "⚠ Health check failed on port $port"
    fi
done

if [ -n "$WORKING_PORT" ]; then
    echo ""
    echo "10. Service is ready! Testing OAuth2 flow..."
    echo "Making test request to port $WORKING_PORT..."

    curl -v -X POST http://localhost:$WORKING_PORT/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \
      -H "Authorization: Bearer gemini-client-key-aaaa" \
      -H "Content-Type: application/json" \
      -d '{"contents": [{"parts": [{"text": "Hello OAuth2 test"}]}]}' 2>&1

    echo ""
    echo ""
    echo "11. Checking OAuth2 debug logs..."
    echo "Waiting for logs to be written..."
    sleep 3

    echo ""
    echo "=== Recent Container Logs ==="
    docker logs --tail=50 api-proxy-nginx 2>&1

    echo ""
    echo "=== OAuth2 Debug Logs ==="
    docker logs api-proxy-nginx 2>&1 | grep -E "(EXTRACT-DEBUG|AUTH-DEBUG|TOKEN-DEBUG|JWT-DEBUG|OAuth2-DEBUG)" | tail -30

else
    echo ""
    echo "✗ Service is not responding on any expected port"
    echo "Checking container logs for errors..."
    docker logs api-proxy-nginx 2>&1 | tail -20
fi

echo ""
echo "===== Diagnosis Complete ====="