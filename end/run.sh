#!/bin/bash

# 加载环境变量
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 默认配置 (如果 .env 没读到)
DB_CONTAINER="api-proxy-mysql"
DB_NAME=${DB_NAME:-oauth2_mock}
DB_USER=${DB_USER:-oauth2_user}
DB_PASS=${DB_PASSWORD:-oauth2_password_123456}

BACKUP_DIR="./backups"

# ==========================================
# 核心功能函数
# ==========================================

function init_environment() {
    echo -e "${GREEN}==> [Init] Checking and initializing directories...${NC}"
    DIRS=("mysql-data" "redis-data" "logs" "tmp" "database" "$BACKUP_DIR")
    
    for dir in "${DIRS[@]}"; do
        if [ ! -d "$dir" ]; then
            echo -e "Creating directory: $dir"
            mkdir -p "$dir"
        fi
        # 宽容权限以避免 Docker 挂载问题
        chmod -R 777 "$dir" 2>/dev/null || true
    done
    echo -e "${GREEN}==> [Init] Done.${NC}"
}

function start_services() {
    init_environment
    echo -e "${GREEN}==> Starting All Services...${NC}"
    
    # 1. 启动基础服务
    echo "Starting Base Services..."
    docker-compose -f docker-compose-base-service.yml up -d
    
    # 2. 启动应用服务
    echo "Starting App Services..."
    docker-compose -f docker-compose.yml up -d --build
    
    show_status
}

function stop_services() {
    echo -e "${YELLOW}==> Stopping All Services...${NC}"
    docker-compose -f docker-compose.yml down
    docker-compose -f docker-compose-base-service.yml down
}

function restart_services() {
    stop_services
    sleep 2
    start_services
}

function show_status() {
    echo -e "\n${GREEN}==> Service Status:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

function show_logs() {
    echo -e "${GREEN}==> Tailing logs (Ctrl+C to exit)...${NC}"
    docker-compose -f docker-compose.yml logs -f
}

# ==========================================
# 数据库工具函数
# ==========================================

function backup_db() {
    echo -e "${GREEN}==> Starting Database Backup...${NC}"
    
    # 确保备份目录存在
    init_environment > /dev/null

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    FILENAME="$BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.sql"

    # 检查容器是否运行
    if [ -z "$(docker ps -q -f name=$DB_CONTAINER)" ]; then
        echo -e "${RED}Error: Database container '$DB_CONTAINER' is not running!${NC}"
        return 1
    fi

    echo "Dumping database '$DB_NAME' from container '$DB_CONTAINER'..."
    # 使用 docker exec 执行 mysqldump
    docker exec "$DB_CONTAINER" /usr/bin/mysqldump -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$FILENAME"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Success! Backup saved to: $FILENAME${NC}"
    else
        echo -e "${RED}Backup Failed! Check container logs or credentials.${NC}"
    fi
}

function restore_db() {
    echo -e "${YELLOW}==> Database Restore Utility${NC}"
    
    # 检查容器
    if [ -z "$(docker ps -q -f name=$DB_CONTAINER)" ]; then
        echo -e "${RED}Error: Database container '$DB_CONTAINER' is not running!${NC}"
        return 1
    fi

    # 列出备份文件
    echo "Available backups in $BACKUP_DIR:"
    # 处理文件列表可能为空的情况
    shopt -s nullglob
    files=($BACKUP_DIR/*.sql)
    shopt -u nullglob
    
    if [ ${#files[@]} -eq 0 ]; then
        echo -e "${RED}No backup files found in $BACKUP_DIR${NC}"
        return 1
    fi

    i=1
    for file in "${files[@]}"; do
        echo "[$i] $(basename "$file")"
        ((i++))
    done

    echo -n "Select backup number to restore (or 0 to cancel): "
    read -r choice

    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#files[@]} ]; then
        SELECTED_FILE="${files[$((choice-1))]}"
        echo -e "${YELLOW}Restoring from: $SELECTED_FILE${NC}"
        echo -e "${RED}WARNING: This will overwrite the current database! Are you sure? (y/n)${NC}"
        read -r confirm
        if [ "$confirm" == "y" ] || [ "$confirm" == "Y" ]; then
            cat "$SELECTED_FILE" | docker exec -i "$DB_CONTAINER" /usr/bin/mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME"
            echo -e "${GREEN}Restore Complete.${NC}"
        else
            echo "Cancelled."
        fi
    else
        echo "Cancelled."
    fi
}

# ==========================================
# 主逻辑
# ==========================================

case "$1" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    backup)
        backup_db
        ;;
    restore)
        restore_db
        ;;
    init)
        init_environment
        ;;
    *)
        echo -e "${GREEN}Usage: $0 {start|stop|restart|status|logs|backup|restore|init}${NC}"
        echo "  start   : Start all services (Base + App)"
        echo "  stop    : Stop all services"
        echo "  restart : Restart all services"
        echo "  status  : Show container status"
        echo "  logs    : Follow app logs"
        echo "  backup  : Backup MySQL database"
        echo "  restore : Restore MySQL database from backup"
        echo "  init    : Initialize directories and permissions"
        exit 1
        ;;
esac
