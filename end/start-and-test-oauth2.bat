@echo off
echo ===== OAuth2 Debug Test Script =====
echo This script will start the service and test OAuth2 authentication
echo.

echo 1. Starting Docker services...
docker-compose up -d
if %errorlevel% neq 0 (
    echo ERROR: Failed to start Docker services
    echo Please run this script as Administrator
    pause
    exit /b 1
)

echo.
echo 2. Waiting for services to start...
timeout /t 10 /nobreak

echo.
echo 3. Checking service health...
curl -s http://localhost:8888/health
if %errorlevel% neq 0 (
    echo WARNING: Health check failed, but continuing...
)

echo.
echo 4. Making OAuth2 test request...
echo This will trigger OAuth2 authentication and generate debug logs
curl -v -X POST http://localhost:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent ^
  -H "Authorization: Bearer gemini-client-key-aaaa" ^
  -H "Content-Type: application/json" ^
  -d "{\"contents\": [{\"parts\": [{\"text\": \"Hello OAuth2 test\"}]}]}"

echo.
echo.
echo 5. Checking OAuth2 debug logs...
echo Looking for [OAuth2-DEBUG] entries...
docker logs api-proxy-nginx 2>&1 | findstr "OAuth2-DEBUG"

echo.
echo 6. Checking recent error logs...
docker logs api-proxy-nginx 2>&1 | findstr /i "error failed"

echo.
echo 7. Checking all recent logs (last 20 lines)...
docker logs --tail=20 api-proxy-nginx

echo.
echo ===== Test Complete =====
echo.
echo If you see OAuth2-DEBUG logs above, the authentication process is working.
echo If you don't see OAuth2-DEBUG logs, check:
echo - Service configuration
echo - Client token mapping
echo - Network connectivity
echo.
pause