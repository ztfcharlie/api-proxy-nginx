# run_hub.ps1
Write-Host "=== 正在停止旧的 Hub Server... ===" -ForegroundColor Yellow
Stop-Process -Name "hub-server" -ErrorAction SilentlyContinue

Write-Host "=== 正在编译 Hub Server... ===" -ForegroundColor Yellow
cd central-hub
go build -o hub-server.exe cmd/server/main.go

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 编译失败！" -ForegroundColor Red
    exit
}
Write-Host "✅ 编译成功！" -ForegroundColor Green

Write-Host "=== 正在启动 Hub Server (新窗口)... ===" -ForegroundColor Cyan
# Start-Process 会弹出一个新窗口运行 Hub，这样你可以在那个窗口看实时日志
Start-Process -FilePath ".\hub-server.exe"

cd ..
Write-Host "=== Hub 已在后台运行 ===" -ForegroundColor Green
