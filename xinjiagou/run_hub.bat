@echo off
echo === Stop Old Hub Server... ===
taskkill /F /IM hub-server.exe >nul 2>&1

echo === Build Hub Server... ===
cd central-hub
go build -o hub-server.exe cmd/server/main.go
if %errorlevel% neq 0 (
    echo [ERROR] Build Failed!
    cd ..
    pause
    exit /b %errorlevel%
)
echo [OK] Build Success!

echo === Start Hub Server (New Window)... ===
start "Hub Server" hub-server.exe
cd ..
echo === Hub is running ===
