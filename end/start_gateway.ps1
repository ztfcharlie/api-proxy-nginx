$env:DB_HOST="localhost"
$env:DB_USER="root"
$env:DB_PASSWORD="123456"
$env:DB_NAME="ai_proxy"
$env:REDIS_HOST="localhost"
$env:REDIS_PASSWORD=""
$env:SERVER_PORT="8080"
$env:NODE_BACKEND="http://localhost:8889"

Write-Host "Starting Go Gateway on port 8080..."
cd go-gateway
go run cmd/gateway/main.go