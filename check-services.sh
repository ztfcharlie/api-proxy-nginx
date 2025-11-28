#!/bin/bash

# 服务健康检查脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# 检查Docker状态
check_docker() {
    log_info "检查 Docker 状态..."

    if ! docker info >/dev/null 2>&1; then
        log_error "Docker 未运行"
        return 1
    fi

    log_success "Docker 运行正常"
    return 0
}

# 检查Docker Compose
check_docker_compose() {
    log_info "检查 Docker Compose..."

    if ! command -v docker-compose >/dev/null 2>&1; then
        log_error "docker-compose 未安装"
        return 1
    fi

    local version=$(docker-compose --version)
    log_success "Docker Compose: $version"
    return 0
}

# 检查配置文件
check_config_files() {
    log_info "检查配置文件..."

    local missing_files=()

    [ ! -f "docker-compose.yaml" ] && missing_files+=("docker-compose.yaml")
    [ ! -f "nginx.conf" ] && missing_files+=("nginx.conf")
    [ ! -f "lua/config.lua" ] && missing_files+=("lua/config.lua")
    [ ! -d "lua" ] && missing_files+=("lua/ 目录")
    [ ! -d "conf.d" ] && missing_files+=("conf.d/ 目录")

    if [ ${#missing_files[@]} -ne 0 ]; then
        log_error "缺少配置文件:"
        for file in "${missing_files[@]}"; do
            echo "  - $file"
        done
        return 1
    fi

    log_success "所有配置文件存在"
    return 0
}

# 检查端口占用
check_ports() {
    log_info "检查端口占用..."

    local ports=("8080" "8443" "6379")
    local occupied_ports=()

    for port in "${ports[@]}"; do
        if netstat -tulpn 2>/dev/null | grep ":$port " >/dev/null; then
            occupied_ports+=("$port")
        fi
    done

    if [ ${#occupied_ports[@]} -ne 0 ]; then
        log_warning "以下端口被占用:"
        for port in "${occupied_ports[@]}"; do
            echo "  - $port"
        done
        echo "这可能导致服务启动失败"
        return 1
    fi

    log_success "所有端口可用"
    return 0
}

# 检查Docker镜像
check_images() {
    log_info "检查 Docker 镜像..."

    local images=("nginx:1.26.1-stable" "redis:7.2.4-alpine" "fluent/fluentd:v1.16-debian-1")
    local missing_images=()

    for image in "${images[@]}"; do
        if ! docker images --format "table {{.Repository}}:{{.Tag}}" | grep "^$image$" >/dev/null; then
            missing_images+=("$image")
        fi
    done

    if [ ${#missing_images[@]} -ne 0 ]; then
        log_warning "缺少 Docker 镜像:"
        for image in "${missing_images[@]}"; do
            echo "  - $image"
        done
        echo "将在启动时自动下载"
        return 1
    fi

    log_success "所有 Docker 镜像可用"
    return 0
}

# 检查目录权限
check_permissions() {
    log_info "检查目录权限..."

    local dirs=("lua" "conf.d" "logs" "html" "ssl" "redis-data")
    local permission_issues=()

    for dir in "${dirs[@]}"; do
        if [ -d "$dir" ]; then
            if [ ! -r "$dir" ] || [ ! -w "$dir" ] || [ ! -x "$dir" ]; then
                permission_issues+=("$dir (读写权限)")
            fi
        else
            permission_issues+=("$dir (目录不存在)")
        fi
    done

    if [ ${#permission_issues[@]} -ne 0 ]; then
        log_warning "权限问题:"
        for issue in "${permission_issues[@]}"; do
            echo "  - $issue"
        done
        echo "请运行: ./init.sh"
        return 1
    fi

    log_success "目录权限正常"
    return 0
}

# 检查服务状态
check_services() {
    log_info "检查服务状态..."

    if ! docker-compose ps >/dev/null 2>&1; then
        log_error "无法获取服务状态"
        return 1
    fi

    local running_services=$(docker-compose ps --services --filter "status=running" 2>/dev/null)
    local total_services=$(docker-compose ps --services 2>/dev/null)

    if [ -z "$running_services" ]; then
        log_warning "没有运行中的服务"
        echo "可用服务:"
        echo "$total_services" | while read -r service; do
            echo "  - $service (已停止)"
        done
        return 1
    fi

    log_success "运行中的服务:"
    echo "$running_services" | while read -r service; do
        echo "  - ✅ $service"
    done

    # 检查是否有未运行的服务
    local stopped_services=$(comm -23 <(echo "$total_services" | sort) <(echo "$running_services" | sort))
    if [ -n "$stopped_services" ]; then
        log_warning "已停止的服务:"
        echo "$stopped_services" | while read -r service; do
            echo "  - ⏸ $service"
        done
    fi

    return 0
}

# 主函数
main() {
    echo "🔍 Gemini API 代理服务健康检查"
    echo "=================================="

    local exit_code=0

    check_docker || exit_code=1
    echo ""

    check_docker_compose || exit_code=1
    echo ""

    check_config_files || exit_code=1
    echo ""

    check_ports || exit_code=1
    echo ""

    check_images || exit_code=1
    echo ""

    check_permissions || exit_code=1
    echo ""

    check_services || exit_code=1
    echo ""

    if [ $exit_code -eq 0 ]; then
        log_success "所有检查通过！系统已准备就绪 🎉"
        echo ""
        echo "🚀 启动命令:"
        echo "  ./start.sh"
        echo "  docker-compose up -d"
        echo "  make up"
        echo ""
        echo "🔗 访问地址:"
        echo "  健康检查: http://localhost:8080/health"
        echo "  服务页面: http://localhost:8080"
        echo "  服务状态: http://localhost:8080/status"
    else
        log_error "发现问题，请修复后重试"
        echo ""
        echo "🛠️ 修复建议:"
        echo "  1. 启动 Docker 服务"
        echo "  2. 安装 Docker Compose"
        echo "  3. 运行 ./init.sh 创建目录"
        echo "  4. 检查端口占用并停止冲突服务"
        echo "  5. 确保配置文件存在"
        echo ""
        echo "📚 获取帮助:"
        echo "  ./check-services.sh --help"
        echo "  cat README.md"
    fi

    return $exit_code
}

# 显示帮助
show_help() {
    echo "Gemini API 代理服务健康检查工具"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示此帮助信息"
    echo "  -v, --verbose  详细输出模式"
    echo ""
    echo "功能:"
    echo "  检查 Docker 和 Docker Compose 状态"
    echo "  验证配置文件完整性"
    echo "  检查端口占用情况"
    echo "  验证 Docker 镜像可用性"
    echo "  检查目录权限"
    echo "  显示服务运行状态"
    echo ""
    echo "示例:"
    echo "  $0              # 运行所有检查"
    echo "  $0 --verbose     # 详细输出模式"
}

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--verbose)
            set -x
            shift
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

# 执行主函数
main "$@"