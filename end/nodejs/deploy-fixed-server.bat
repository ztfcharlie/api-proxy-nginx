@echo off
REM CSP修复版Web管理界面部署脚本 - Windows版本

echo 🔧 开始部署CSP修复版Web管理界面...

REM 检查当前目录
if not exist "package.json" (
    echo ❌ 错误: 请在Node.js项目根目录运行此脚本
    pause
    exit /b 1
)

REM 停止当前在8889端口运行的Node.js进程
echo 🛑 停止当前运行的服务...
for /f "tokens=5" %%a in ('netstat -ano ^| find ":8889"') do (
    echo 正在停止进程 %%a...
    taskkill /PID %%a /F >nul 2>&1
)

REM 等待端口释放
timeout /t 3 /nobreak >nul
echo ✅ 端口8889已释放

REM 安装依赖（如果需要）
if not exist "node_modules" (
    echo 📦 安装依赖...
    npm install
)

REM 备份当前服务（如果存在）
if exist "start-web-demo.js" (
    echo 💾 备份当前服务...
    set timestamp=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
    set timestamp=%timestamp: =0%
    copy "start-web-demo.js" "start-web-demo.js.backup.%timestamp%" >nul
)

REM 使用CSP修复版本启动服务
echo 🚀 启动CSP修复版服务...
start /B node fix-csp-server.js > csp-server.log 2>&1

REM 等待服务启动
echo ⏳ 等待服务启动...
timeout /t 5 /nobreak >nul

REM 检查服务是否运行
netstat -ano | find ":8889" >nul
if %errorlevel% equ 0 (
    echo ✅ 服务启动成功!

    REM 测试健康检查端点
    echo 🔍 测试服务健康状态...
    timeout /t 2 /nobreak >nul

    curl -s http://localhost:8889/health | find "csp-fixed" >nul
    if %errorlevel% equ 0 (
        echo ✅ CSP修复版服务运行正常!
        echo.
        echo 🎉 部署完成! 访问地址:
        echo    📱 本地: http://localhost:8889/admin/
        echo    🌐 公网: http://47.239.10.174:8889/admin/
        echo.
        echo 🔧 CSP修复功能:
        echo    ✅ 移除了Content-Security-Policy限制
        echo    ✅ 允许加载外部CDN资源
        echo    ✅ React/Tailwind CSS等脚本现在可正常加载
        echo.
        echo 📋 服务信息:
        echo    📝 日志文件: csp-server.log
        echo    🔄 重启服务: deploy-fixed-server.bat
        echo    🛑 停止服务: taskkill /IM node.exe /FI "WINDOWTITLE eq fix-csp-server.js"
    ) else (
        echo ❌ 服务健康检查失败，请查看日志: csp-server.log
        for /f "tokens=5" %%a in ('netstat -ano ^| find ":8889"') do (
            taskkill /PID %%a /F >nul 2>&1
        )
        pause
        exit /b 1
    )
) else (
    echo ❌ 服务启动失败，请检查错误信息
    if exist "csp-server.log" (
        echo 错误日志:
        type csp-server.log
    )
    pause
    exit /b 1
)

pause