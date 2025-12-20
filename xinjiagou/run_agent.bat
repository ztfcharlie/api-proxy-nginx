@echo off
echo === Stop Old Agent... ===
taskkill /F /IM agent.exe >nul 2>&1

echo === Build Agent... ===
cd edge-agent
go build -o agent.exe cmd/agent/main.go
if %errorlevel% neq 0 (
    echo [ERROR] Build Failed!
    cd ..
    pause
    exit /b %errorlevel%
)
echo [OK] Build Success!

echo === Start Agent (New Window)... ===
start "Agent Client" agent.exe -id agent-dev-001
cd ..
echo === Agent is running ===
