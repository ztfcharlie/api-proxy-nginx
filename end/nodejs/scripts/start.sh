#!/bin/bash

# OAuth2 Mock Service 启动脚本
# 用于开发和生产环境的快速启动

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检查服务状态
check_service() {
    local service_name=$1
    local port=$2
    local max_attempts=30
    local attempt=1

    log_info "检查服务 $service_name (端口 $port)..."

    while [ $attempt -le $max_attempts ]; do
        if curl -f "http://localhost:$port/health" >/dev/null 2>&1; then
            log_success "$service_name 已启动"
            return 0
        fi

        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done

    echo
    log_error "$service_name 启动失败或超时"
    return 1
}

# 主函数
main() {
    local action=${1:-"start"}
    local mode=${2:-"development"}

    log_info "OAuth2 Mock Service 启动脚本"
    log_info "动作: $action"
    log_info "模式: $mode"
    echo

    case $action in
        "start")
            case $mode in
                "production")
                    log_info "生产模式启动..."

                    # 检查必需的命令
                    if ! command_exists docker; then
                        log_error "Docker 未安装"
                        exit 1
                    fi

                    if ! command_exists docker-compose; then
                        log_error "Docker Compose 未安装"
                        exit 1
                    fi

                    # 启动服务
                    log_info "启动 Node.js OAuth2 服务..."
                    docker-compose -f docker-compose.yml up -d

                    # 检查服务状态
                    log_info "等待服务启动..."
                    check_service "OAuth2 Service" 8889
                    check_service "MySQL" 3306
                    check_service "Redis" 6379

                    log_success "所有服务已启动"
                    echo
                    log_info "服务地址:"
                    echo "  - OAuth2 API: http://localhost:8889"
                    echo "  - 健康检查: http://localhost:8889/health"
                    echo "  - API文档: http://localhost:8889/api-docs"
                    echo "  - MySQL: localhost:3306"
                    echo "  - Redis: localhost:6379"

                    ;;

                "development")
                    log_info "开发模式启动..."

                    # 检查 Node.js
                    if ! command_exists node; then
                        log_error "Node.js 未安装"
                        exit 1
                    fi

                    if ! command_exists npm; then
                        log_error "npm 未安装"
                        exit 1
                    fi

                    # 检查依赖
                    if [ ! -d "node_modules" ]; then
                        log_info "安装依赖..."
                        npm install
                    fi

                    # 检查环境变量文件
                    if [ ! -f ".env" ]; then
                        log_warning ".env 文件不存在，从模板复制..."
                        cp .env.example .env
                        log_info "请编辑 .env 文件配置数据库等信息"
                    fi

                    # 启动服务
                    log_info "启动开发服务器..."
                    npm run dev

                    ;;

                *)
                    log_error "不支持的启动模式: $mode"
                    echo "支持的模式: development, production"
                    exit 1
                    ;;
            esac
            ;;

        "stop")
            log_info "停止服务..."

            # 停止 Docker 服务
            if [ -f "docker-compose.yml" ]; then
                docker-compose -f docker-compose.yml down
                log_success "Docker 服务已停止"
            else
                log_warning "docker-compose.yml 不存在"
            fi

            # 停止开发服务器
            if pgrep -f "node server/app.js" > /dev/null; then
                pkill -f "node server/app.js"
                log_success "开发服务器已停止"
            fi

            ;;

        "restart")
            log_info "重启服务..."
            ./scripts/start.sh stop
            sleep 2
            ./scripts/start.sh start $mode
            ;;

        "logs")
            log_info "查看日志..."

            if [ -f "docker-compose.yml" ]; then
                docker-compose -f docker-compose.yml logs -f
            else
                tail -f logs/*.log 2>/dev/null || echo "没有找到日志文件"
            fi

            ;;

        "status")
            log_info "检查服务状态..."

            if [ -f "docker-compose.yml" ]; then
                docker-compose -f docker-compose.yml ps
            else
                log_warning "docker-compose.yml 不存在"
            fi

            # 检查开发服务器
            if pgrep -f "node server/app.js" > /dev/null; then
                log_success "开发服务器正在运行"
            else
                log_warning "开发服务器未运行"
            fi

            ;;

        "build")
            log_info "构建服务..."

            if [ -f "docker-compose.yml" ]; then
                docker-compose -f docker-compose.yml build
                log_success "Docker 镜像构建完成"
            else
                log_error "docker-compose.yml 不存在"
                exit 1
            fi

            ;;

        "clean")
            log_info "清理服务..."

            # 停止并删除容器
            if [ -f "docker-compose.yml" ]; then
                docker-compose -f docker-compose.yml down -v
                log_success "Docker 容器和卷已清理"
            fi

            # 清理日志
            if [ -d "logs" ]; then
                rm -rf logs/*.log
                log_success "日志文件已清理"
            fi

            # 清理临时文件
            if [ -d "../tmp/oauth2" ]; then
                rm -rf ../tmp/oauth2/*
                log_success "临时文件已清理"
            fi

            ;;

        "help")
            echo "OAuth2 Mock Service 启动脚本"
            echo
            echo "用法: $0 [action] [mode]"
            echo
            echo "动作:"
            echo "  start     启动服务 (默认)"
            echo "  stop      停止服务"
            echo "  restart   重启服务"
            echo "  logs      查看日志"
            echo "  status    检查状态"
            echo "  build     构建镜像"
            echo "  clean     清理服务"
            echo "  help      显示帮助"
            echo
            echo "模式 (仅对 start 有效):"
            echo "  production   生产模式 (使用 Docker) - 默认"
            echo "  development  开发模式 (本地运行)"
            echo
            echo "示例:"
            echo "  $0 start production   # 生产模式启动"
            echo "  $0 start development  # 开发模式启动"
            echo "  $0 stop               # 停止所有服务"
            echo "  $0 logs               # 查看日志"

            ;;

        *)
            log_error "未知的动作: $action"
            echo "使用 '$0 help' 查看帮助"
            exit 1
            ;;
    esac
}

# 脚本入口
main "$@"