@echo off
echo 🔍 部署前检查清单
echo ==================

cd /d "%~dp0"

REM 检查文件存在性
echo 📁 检查必要文件...

if exist "docker-compose.yml" (
    echo ✅ docker-compose.yml
) else (
    echo ❌ docker-compose.yml - 文件不存在
)

if exist "nodejs\docker-compose.yml" (
    echo ✅ nodejs\docker-compose.yml
) else (
    echo ❌ nodejs\docker-compose.yml - 文件不存在
)

if exist "nodejs\Dockerfile" (
    echo ✅ nodejs\Dockerfile
) else (
    echo ❌ nodejs\Dockerfile - 文件不存在
)

if exist "nodejs\package.json" (
    echo ✅ nodejs\package.json
) else (
    echo ❌ nodejs\package.json - 文件不存在
)

if exist "database\schema.sql" (
    echo ✅ database\schema.sql
) else (
    echo ❌ database\schema.sql - 文件不存在
)

if exist "nginx\conf.d\gemini-proxy.conf" (
    echo ✅ nginx\conf.d\gemini-proxy.conf
) else (
    echo ❌ nginx\conf.d\gemini-proxy.conf - 文件不存在
)

echo.
echo 📂 检查目录结构...

if exist "mysql-data" (
    echo ✅ mysql-data
) else (
    echo ⚠️  mysql-data - 目录不存在（部署时会自动创建）
)

if exist "redis-data" (
    echo ✅ redis-data
) else (
    echo ⚠️  redis-data - 目录不存在（部署时会自动创建）
)

if exist "logs\oauth2" (
    echo ✅ logs\oauth2
) else (
    echo ⚠️  logs\oauth2 - 目录不存在（部署时会自动创建）
)

if exist "tmp\oauth2" (
    echo ✅ tmp\oauth2
) else (
    echo ⚠️  tmp\oauth2 - 目录不存在（部署时会自动创建）
)

if exist "client\google_server_account" (
    echo ✅ client\google_server_account
) else (
    echo ⚠️  client\google_server_account - 目录不存在（部署时会自动创建）
)

if exist "nodejs\server" (
    echo ✅ nodejs\server
) else (
    echo ❌ nodejs\server - 目录不存在
)

echo.
echo 🔧 检查配置文件语法...

REM 检查docker-compose语法
docker-compose config >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 主项目docker-compose.yml语法正确
) else (
    echo ❌ 主项目docker-compose.yml语法错误
)

cd nodejs
docker-compose config >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Node.js项目docker-compose.yml语法正确
) else (
    echo ❌ Node.js项目docker-compose.yml语法错误
)

cd ..

echo.
echo 📦 检查Node.js依赖...
if exist "nodejs\package.json" (
    echo ✅ package.json存在

    REM 检查关键依赖
    findstr /C:"\"express\"" nodejs\package.json >nul && echo ✅ 依赖 express || echo ❌ 缺少依赖 express
    findstr /C:"\"mysql2\"" nodejs\package.json >nul && echo ✅ 依赖 mysql2 || echo ❌ 缺少依赖 mysql2
    findstr /C:"\"redis\"" nodejs\package.json >nul && echo ✅ 依赖 redis || echo ❌ 缺少依赖 redis
    findstr /C:"\"jsonwebtoken\"" nodejs\package.json >nul && echo ✅ 依赖 jsonwebtoken || echo ❌ 缺少依赖 jsonwebtoken
    findstr /C:"\"cors\"" nodejs\package.json >nul && echo ✅ 依赖 cors || echo ❌ 缺少依赖 cors
    findstr /C:"\"helmet\"" nodejs\package.json >nul && echo ✅ 依赖 helmet || echo ❌ 缺少依赖 helmet
    findstr /C:"\"winston\"" nodejs\package.json >nul && echo ✅ 依赖 winston || echo ❌ 缺少依赖 winston
) else (
    echo ❌ package.json不存在
)

echo.
echo 🗄️  检查数据库脚本...
if exist "database\schema.sql" (
    findstr /C:"token_mappings" database\schema.sql >nul && echo ✅ 表 token_mappings || echo ❌ 缺少表 token_mappings
    findstr /C:"service_accounts" database\schema.sql >nul && echo ✅ 表 service_accounts || echo ❌ 缺少表 service_accounts
    findstr /C:"access_tokens" database\schema.sql >nul && echo ✅ 表 access_tokens || echo ❌ 缺少表 access_tokens
    findstr /C:"refresh_tokens" database\schema.sql >nul && echo ✅ 表 refresh_tokens || echo ❌ 缺少表 refresh_tokens
    findstr /C:"clients" database\schema.sql >nul && echo ✅ 表 clients || echo ❌ 缺少表 clients
) else (
    echo ❌ 数据库脚本不存在
)

echo.
echo 🌐 检查Nginx配置...
if exist "nginx\conf.d\gemini-proxy.conf" (
    findstr /C:"api-proxy-nodejs:8889" nginx\conf.d\gemini-proxy.conf >nul && echo ✅ 配置 api-proxy-nodejs:8889 || echo ❌ 缺少配置 api-proxy-nodejs:8889
    findstr /C:"oauth2.googleapis.com/token" nginx\conf.d\gemini-proxy.conf >nul && echo ✅ 配置 oauth2.googleapis.com/token || echo ❌ 缺少配置 oauth2.googleapis.com/token
    findstr /C:"www.googleapis.com/oauth2/v1/certs" nginx\conf.d\gemini-proxy.conf >nul && echo ✅ 配置 www.googleapis.com/oauth2/v1/certs || echo ❌ 缺少配置 www.googleapis.com/oauth2/v1/certs
) else (
    echo ❌ Nginx配置文件不存在
)

echo.
echo 🐳 检查Docker环境...
docker --version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Docker已安装

    docker info >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ Docker服务运行中
    ) else (
        echo ❌ Docker服务未运行
    )
) else (
    echo ❌ Docker未安装
)

echo.
echo 🔌 检查端口占用...
netstat -an | findstr ":8888" >nul && echo ⚠️  端口 8888 (主代理服务) 已被占用 || echo ✅ 端口 8888 (主代理服务) 可用
netstat -an | findstr ":8889" >nul && echo ⚠️  端口 8889 (OAuth2服务) 已被占用 || echo ✅ 端口 8889 (OAuth2服务) 可用
netstat -an | findstr ":3306" >nul && echo ⚠️  端口 3306 (MySQL数据库) 已被占用 || echo ✅ 端口 3306 (MySQL数据库) 可用
netstat -an | findstr ":6379" >nul && echo ⚠️  端口 6379 (Redis缓存) 已被占用 || echo ✅ 端口 6379 (Redis缓存) 可用

echo.
echo 💾 检查系统资源...
echo 磁盘使用情况：
dir /-c | findstr /C:"bytes free"

echo.
echo 🎉 检查完成！
echo.
echo 如果所有检查项都通过，可以安全运行部署脚本：
echo   deploy.bat
echo.
echo 如果有错误，请先修复后再部署。
pause