@echo off
echo 🚀 启动基础服务 (MySQL + Redis)
echo ================================

cd /d "%~dp0"

REM 检查Docker环境
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker未安装，请先安装Docker Desktop
    pause
    exit /b 1
)

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker服务未运行，请启动Docker Desktop
    pause
    exit /b 1
)

echo ✅ Docker环境检查通过

REM 创建必要目录
echo 📁 创建基础服务数据目录...
mkdir mysql-data 2>nul
mkdir redis-data 2>nul
mkdir data\client 2>nul
mkdir data\map 2>nul

REM 检查database目录
if not exist "database" (
    echo ❌ database目录不存在，请确保schema.sql文件存在
    pause
    exit /b 1
)

if not exist "database\schema.sql" (
    echo ❌ database\schema.sql文件不存在
    pause
    exit /b 1
)

echo ✅ 必要文件和目录检查通过

REM 停止现有基础服务
echo 🛑 停止现有基础服务...
docker-compose -f docker-compose-base-service.yml down

REM 清理网络（重新创建）
echo 🔄 清理并重建网络...
docker network rm api-proxy-network 2>nul

REM 启动基础服务
echo 🚀 启动基础服务...
docker-compose -f docker-compose-base-service.yml up -d

REM 等待服务启动
echo ⏳ 等待MySQL和Redis服务启动...
timeout /t 45 /nobreak

REM 验证服务状态
echo 🔍 验证基础服务状态...
docker-compose -f docker-compose-base-service.yml ps

REM 测试MySQL连接
echo 🗄️ 测试MySQL数据库连接...
set max_attempts=10
set attempt=1

:mysql_test
docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysqladmin ping -h localhost -u oauth2_user -poauth2_password_123456 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ MySQL连接成功！
    goto :redis_test
) else (
    if %attempt% leq %max_attempts% (
        echo ⏳ MySQL还未就绪，等待10秒... (尝试 %attempt%/%max_attempts%)
        timeout /t 10 /nobreak
        set /a attempt+=1
        goto :mysql_test
    ) else (
        echo ❌ MySQL启动失败，查看日志...
        docker-compose -f docker-compose-base-service.yml logs api-proxy-mysql
        pause
        exit /b 1
    )
)

:redis_test
echo 💾 测试Redis缓存连接...
docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 ping >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Redis连接成功！
) else (
    echo ❌ Redis连接失败
    docker-compose -f docker-compose-base-service.yml logs api-proxy-redis
)

REM 验证网络创建
echo 🔗 验证网络创建...
docker network ls | findstr api-proxy-network >nul
if %errorlevel% equ 0 (
    echo ✅ 网络api-proxy-network已创建
) else (
    echo ❌ 网络创建失败
)

REM 验证数据库初始化
echo 📋 验证数据库初始化...
docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 数据库已初始化
) else (
    echo ❌ 数据库初始化失败或未完成
    echo 🔍 检查MySQL错误日志:
    docker-compose -f docker-compose-base-service.yml logs api-proxy-mysql
)

echo.
echo 🎉 基础服务启动完成！
echo.
echo 📍 服务地址:
echo    - MySQL数据库: localhost:3306
echo    - Redis缓存: localhost:6379
echo    - 网络名称: api-proxy-network
echo.
echo 🔧 下一步操作:
echo    1. 启动Node.js应用服务: cd nodejs && docker-compose up -d
echo    2. 启动OpenResty网关: docker-compose up -d
echo.
echo 📊 查看服务状态: docker-compose -f docker-compose-base-service.yml ps
pause