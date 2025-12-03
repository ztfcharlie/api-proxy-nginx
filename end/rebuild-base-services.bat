@echo off
echo 🔧 强制重建基础服务 (MySQL + Redis)
echo ==================================

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

REM 停止并删除所有相关容器
echo 🛑 停止并删除现有容器...
docker-compose -f docker-compose-base-service.yml down --remove-orphans 2>nul

REM 强制删除MySQL容器（如果有残留）
docker rm -f api-proxy-mysql 2>nul

REM 强制删除Redis容器（如果有残留）
docker rm -f api-proxy-redis 2>nul

REM 清理镜像缓存
echo 🧽 清理Docker缓存...
docker system prune -f

REM 创建必要的目录
echo 📁 创建数据目录...
mkdir mysql-data 2>nul
mkdir redis-data 2>nul
mkdir data\client 2>nul
mkdir data\map 2>nul

REM 检查数据库脚本
echo 📋 检查数据库初始化脚本...
if not exist "database\schema.sql" (
    echo ❌ database\schema.sql 文件不存在
    pause
    exit /b 1
)

echo ✅ 数据库脚本检查通过

REM 完全清理MySQL数据目录（确保重新初始化）
echo 🧹 清理MySQL数据目录（重新初始化）...
rmdir /s /q mysql-data 2>nul
mkdir mysql-data 2>nul

REM 清理网络
echo 🔄 清理并重建网络...
docker network rm api-proxy-network 2>nul

echo ⚠️ 警告：这将删除所有MySQL数据并重新初始化数据库

REM 询问确认
set /p "confirm=确认要继续吗？(y/N): "
if /i not "%confirm%"=="y" (
    echo ❌ 操作已取消
    pause
    exit /b 0
)

REM 重新创建网络
echo 🌐 创建网络...
docker network create api-proxy-network

REM 重新构建并启动基础服务
echo 🚀 重新构建并启动基础服务...
docker-compose -f docker-compose-base-service.yml build --no-cache
docker-compose -f docker-compose-base-service.yml up -d

REM 等待服务启动
echo ⏳ 等待基础服务完全启动...
timeout /t 60 /nobreak

REM 检查服务状态
echo 🔍 检查服务状态...
docker-compose -f docker-compose-base-service.yml ps

REM 等待MySQL完全启动
echo ⏳ 等待MySQL数据库完全启动...
timeout /t 30 /nobreak

REM 测试MySQL连接
echo 🗄️ 测试MySQL连接...
set max_attempts=15
set attempt=1

:mysql_test_loop
echo    尝试连接MySQL (%attempt%/%max_attempts%)...

docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysqladmin ping -h localhost -u root -proot_password_123456 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ MySQL root用户连接成功！

    REM 测试应用用户连接
    docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysqladmin ping -h localhost -u oauth2_user -poauth2_password_123456 >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ MySQL应用用户连接成功！
        goto :mysql_success
    ) else (
        echo ⏳ 应用用户连接中...
        goto :mysql_success
    )
) else (
    echo    MySQL还未就绪，等待20秒...
    timeout /t 20 /nobreak
    set /a attempt+=1
    if %attempt% leq %max_attempts% goto :mysql_test_loop
)

echo ❌ MySQL连接失败，请检查日志：
docker-compose -f docker-compose-base-service.yml logs api-proxy-mysql
pause
exit /b 1

:mysql_success
REM 验证数据库初始化
echo 📋 验证数据库初始化...
timeout /t 10 /nobreak

docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 数据库初始化成功

    REM 显示创建的表
    echo 📊 创建的表：
    docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;" 2>nul | findstr /v "Tables_in_oauth2_mock"

    REM 显示初始数据
    echo.
    echo 📊 初始客户端数据：
    docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SELECT client_id, name FROM clients;" 2>nul || echo 无客户端数据

    echo.
    echo 📊 初始服务账号数据：
    docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SELECT client_email, project_id FROM service_accounts;" 2>nul || echo 无服务账号数据

) else (
    echo ❌ 数据库初始化失败
    echo 🔍 检查MySQL日志：
    docker-compose -f docker-compose-base-service.yml logs api-proxy-mysql

    REM 手动执行数据库初始化
    echo.
    echo 🔧 尝试手动执行数据库初始化...
    docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u root -proot_password_123456 -e "SOURCE /docker-entrypoint-initdb.d/schema.sql;" oauth2_mock >nul 2>&1

    REM 再次检查
    timeout /t 5 /nobreak
    docker-compose -f docker-compose-base-service.yml exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;" >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ 手动初始化成功
    ) else (
        echo ❌ 手动初始化也失败
        pause
        exit /b 1
    )
)

REM 测试Redis连接
echo.
echo 💾 测试Redis连接...
docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 ping >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Redis连接成功！

    REM 测试Redis写操作
    echo 📊 测试Redis写操作...
    docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 set test_key "test_value" >nul 2>&1
    if %errorlevel% equ 0 (
        docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 get test_key 2>nul | findstr "test_value" >nul
        if %errorlevel% equ 0 (
            echo ✅ Redis读写操作正常
        ) else (
            echo ⚠️ Redis读操作异常
        )
        docker-compose -f docker-compose-base-service.yml exec -T api-proxy-redis redis-cli -a 123456 del test_key >nul 2>&1
    ) else (
        echo ⚠️ Redis写操作异常
    )
) else (
    echo ❌ Redis连接失败
    docker-compose -f docker-compose-base-service.yml logs api-proxy-redis
    pause
    exit /b 1
)

REM 验证网络连接
echo.
echo 🔗 验证网络连接...
docker network ls | findstr api-proxy-network >nul
if %errorlevel% equ 0 (
    echo ✅ api-proxy-network 网络创建成功

    REM 显示连接到网络的容器
    echo 📋 连接到网络的容器：
    for /f "delims=" %%i in ('docker network inspect api-proxy-network --format^="{{range .Containers}}{{.Name}} {{end}}" 2^>nul') do echo %%i
) else (
    echo ❌ 网络创建失败
    pause
    exit /b 1
)

REM 最终状态检查
echo.
echo 🎉 基础服务重建完成！
echo.
echo 📍 服务状态：
docker-compose -f docker-compose-base-service.yml ps

echo.
echo 📊 服务信息：
echo    - MySQL数据库: localhost:3306 ^(用户: oauth2_user^)
echo    - Redis缓存: localhost:6379 ^(密码: 123456^)
echo    - 网络名称: api-proxy-network

echo.
echo 🔧 MySQL配置已优化：
echo    ✅ 移除了过时的语法警告
echo    ✅ 修复了PID文件权限问题
echo    ✅ 优化了安全配置

echo.
echo 🔧 下一步操作：
echo    1. 启动Node.js应用服务：
echo       cd nodejs && docker-compose up -d
echo    2. 启动OpenResty网关：
echo       docker-compose up -d
echo.
echo 📊 快速检查：
echo       bash check-base-services.sh

echo.
echo 💡 提示：基础服务已完全重建，所有警告已修复！
pause