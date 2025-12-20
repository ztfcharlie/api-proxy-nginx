# run_agent.ps1
Write-Host "=== 正在停止旧的 Agent... ===" -ForegroundColor Yellow
Stop-Process -Name "agent" -ErrorAction SilentlyContinue

Write-Host "=== 正在编译 Agent... ===" -ForegroundColor Yellow
cd edge-agent
go build -o agent.exe cmd/agent/main.go

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 编译失败！" -ForegroundColor Red
    exit
}
Write-Host "✅ 编译成功！" -ForegroundColor Green

Write-Host "=== 正在启动 Agent (新窗口)... ===" -ForegroundColor Cyan
# 启动时带上 ID 参数，方便区分
Start-Process -FilePath ".\agent.exe" -ArgumentList "-id agent-dev-001"

cd ..
Write-Host "=== Agent 已在后台运行 ===" -ForegroundColor Green
