#!/bin/bash

# ==========================================
# 项目管理脚本 v2.0
# 集成环境初始化、服务精细化管理、数据库备份与恢复
# ==========================================

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 加载 .env 文件
if [ -f ".env" ]; then
    source .env
else
    echo -e "${RED}错误: 未找到 .env 文件。请复制 .env.example 并配置。${NC}"
    exit 1
fi

# 定义服务对应的 Compose 文件
COMPOSE_BASE="-f docker-compose-base-service.yml"
COMPOSE_NODE="-f nodejs/docker-compose.yml"
COMPOSE_NGINX="-f docker-compose.yml"

# ==========================================
# 核心功能函数
# ==========================================

# 1. 初始化环境 (整合原 init.sh)
init_env() {
    echo -e "${YELLOW}正在初始化环境目录...${NC}"
    
    # 定义目录列表
    directories=(
        "redis-data"
        "nginx"
        "nginx/conf.d"
        "nginx/oauth2_certs"
        "lua"
        "logs"
        "html"
        "ssl"
        "data"
        "config"
        "redis"
        "mysql-data"
        "mysql-files"
        "nodejs/logs"
        "nodejs/tmp"
        "database"
        "client"
        "database/backups"
    )

    # 创建目录
    for dir in "${directories[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            echo "已创建: $dir"
        fi
    done

    # 授予权限
    echo -e "${YELLOW}正在设置目录权限...${NC}"
    chmod -R 777 redis-data nginx lua logs html ssl data config redis mysql-data nodejs/logs nodejs/tmp mysql-files database
    
    # 确保网络存在
    if ! docker network ls | grep -q "api-proxy-network"; then
        echo "创建 docker 网络: api-proxy-network"
        docker network create api-proxy-network
    fi

    echo -e "${GREEN}环境初始化完成！${NC}"
}

# 2. 启动服务 (支持单独启动)
start_services() {
    local target=$1
    if [ -z "$target" ]; then target="all"; fi

    echo -e "${YELLOW}正在启动服务: ${target}${NC}"

    case "$target" in
        base)
            docker-compose $COMPOSE_BASE up -d
            ;;
        node)
            docker-compose $COMPOSE_NODE up -d
            ;;
        nginx)
            docker-compose $COMPOSE_NGINX up -d
            ;;
        all)
            # 顺序启动
            echo "启动基础服务 (MySQL, Redis)..."
            docker-compose $COMPOSE_BASE up -d
            echo "等待基础服务就绪 (5s)..."
            sleep 5
            echo "启动 Node.js 服务..."
            docker-compose $COMPOSE_NODE up -d
            echo "启动 Nginx 服务..."
            docker-compose $COMPOSE_NGINX up -d
            ;;
        *)
            echo -e "${RED}错误: 未知服务 '$target'。可选: base, node, nginx, all${NC}"
            exit 1
            ;;
    esac

    if [ "$target" != "all" ]; then
        echo -e "${GREEN}服务 $target 已启动${NC}"
    else
        echo -e "${GREEN}所有服务已启动${NC}"
    fi
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

# 3. 停止服务 (支持单独停止)
stop_services() {
    local target=$1
    if [ -z "$target" ]; then target="all"; fi

    echo -e "${YELLOW}正在停止服务: ${target}${NC}"

    case "$target" in
        nginx)
            docker-compose $COMPOSE_NGINX down
            ;;
        node)
            docker-compose $COMPOSE_NODE down
            ;;
        base)
            docker-compose $COMPOSE_BASE down
            ;;
        all)
            # 反向停止
            docker-compose $COMPOSE_NGINX down
            docker-compose $COMPOSE_NODE down
            docker-compose $COMPOSE_BASE down
            ;;
        *)
            echo -e "${RED}错误: 未知服务 '$target'。可选: base, node, nginx, all${NC}"
            exit 1
            ;;
    esac
    echo -e "${GREEN}服务停止操作完成。${NC}"
}

# 4. 重启服务 (支持单独重启)
restart_services() {
    local target=$1
    if [ -z "$target" ]; then target="all"; fi
    
    stop_services "$target"
    sleep 2
    start_services "$target"
}

# 5. 查看状态
status_services() {
    echo -e "${YELLOW}当前服务状态:${NC}"
    docker ps -a --filter "network=api-proxy-network"
}

# 6. 查看日志
show_logs() {
    local service=$1
    echo -e "${YELLOW}查看日志 (Ctrl+C 退出)...${NC}"
    
    if [ -z "$service" ]; then
        # 默认查看所有关键服务的日志
        docker-compose $COMPOSE_NGINX logs -f &
        docker-compose $COMPOSE_NODE logs -f &
        wait
    else
        # 尝试在各个 compose 中查找服务
        docker-compose $COMPOSE_NGINX logs -f $service 2>/dev/null || \
        docker-compose $COMPOSE_NODE logs -f $service 2>/dev/null || \
        docker-compose $COMPOSE_BASE logs -f $service 2>/dev/null
    fi
}

# 7. 数据库备份
backup_database() {
    echo -e "${YELLOW}正在备份 MySQL 数据库...${NC}"
    
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_DIR="./database/backups"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql"
    
    # 从 .env 获取密码 (去除引号)
    local DB_PWD=$(echo $DB_PASSWORD | tr -d '"')
    local DB_USR=$(echo $DB_USER | tr -d '"')
    local DB_NM=$(echo $DB_NAME | tr -d '"')

    docker exec api-proxy-mysql mysqldump -u"$DB_USR" -p"$DB_PWD" "$DB_NM" > "$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}备份成功: $BACKUP_FILE${NC}"
    else
        echo -e "${RED}备份失败!${NC}"
    fi
}

# 8. 数据库恢复/初始化 (支持指定文件)
exec_database_sql() {
    local sql_file=$1
    
    # 默认值
    if [ -z "$sql_file" ]; then
        echo -e "${YELLOW}未指定文件，尝试使用默认 Schema: database/schema_v2.sql${NC}"
        sql_file="database/schema_v2.sql"
    fi

    if [ ! -f "$sql_file" ]; then
        echo -e "${RED}错误: 文件 '$sql_file' 不存在！${NC}"
        exit 1
    fi

    echo -e "${YELLOW}正在从文件恢复数据库: $sql_file ...${NC}"
    
    local DB_PWD=$(echo $DB_PASSWORD | tr -d '"')
    local DB_USR=$(echo $DB_USER | tr -d '"')
    local DB_NM=$(echo $DB_NAME | tr -d '"')

    # 检查数据库容器是否运行
    if ! docker ps | grep -q "api-proxy-mysql"; then
        echo -e "${RED}错误: MySQL 容器未运行。请先执行 ./run.sh start base${NC}"
        exit 1
    fi

    docker exec -i api-proxy-mysql mysql -u"$DB_USR" -p"$DB_PWD" "$DB_NM" < "$sql_file"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}数据库导入成功!${NC}"
    else
        echo -e "${RED}数据库导入失败，请检查 SQL 文件格式或数据库连接。${NC}"
    fi
}

# ==========================================
# 主逻辑
# ==========================================

case "$1" in
    init)
        init_env
        ;;
    start)
        start_services "$2"
        ;;
    stop)
        stop_services "$2"
        ;;
    restart)
        restart_services "$2"
        ;;
    status)
        status_services
        ;;
    logs)
        show_logs "$2"
        ;;
    backupdb)
        backup_database
        ;;
    exec_database_sql)
        exec_database_sql "$2"
        ;;
    update_schema)
        update_schema
        ;;
    help|*)
        echo "用法: $0 {init|start|stop|restart|status|logs|backupdb|exec_database_sql}"
        echo "----------------------------------------------------------------"
        echo "  init                 - 初始化目录结构和权限"
        echo "  start [service]      - 启动服务 (可选: base, node, nginx, all)"
        echo "  stop [service]       - 停止服务 (可选: base, node, nginx, all)"
        echo "  restart [service]    - 重启服务 (可选: base, node, nginx, all)"
        echo "  status               - 查看服务状态"
        echo "  logs [name]          - 查看日志"
        echo "  backupdb             - 备份 MySQL 数据库"
        echo "  exec_database_sql [file] - 从 SQL 文件恢复数据库"
        echo "----------------------------------------------------------------"
        exit 1
        ;;
esac