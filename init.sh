#!/bin/bash

# Gemini API 代理项目初始化脚本
# 自动创建必要的目录并设置权限

set -e  # 遇到错误时退出

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

# 检查是否为root用户或具有sudo权限
check_permissions() {
    if [[ $EUID -eq 0 ]]; then
        log_info "以root用户运行，将设置正确的权限"
        return 0
    fi

    if ! sudo -n true 2>/dev/null; then
        log_warning "可能需要sudo权限来设置某些目录权限"
        log_info "如果提示输入密码，请输入您的用户密码"
    fi
}

# 创建目录函数
create_directory() {
    local dir_path="$1"
    local description="$2"

    if [ ! -d "$dir_path" ]; then
        log_info "创建 $description 目录: $dir_path"
        mkdir -p "$dir_path"

        # 设置权限
        if [[ $EUID -eq 0 ]]; then
            chmod 777 "$dir_path"
        else
            chmod 777 "$dir_path" 2>/dev/null || sudo chmod 777 "$dir_path" 2>/dev/null || {
                log_warning "无法设置777权限，请手动设置: chmod 777 $dir_path"
            }
        fi

        log_success "✓ $description 目录创建完成"
    else
        log_info "$description 目录已存在: $dir_path"

        # 确保权限正确
        if [[ $EUID -eq 0 ]]; then
            chmod 777 "$dir_path"
        else
            chmod 777 "$dir_path" 2>/dev/null || sudo chmod 777 "$dir_path" 2>/dev/null || {
                log_warning "无法设置777权限，请手动设置: chmod 777 $dir_path"
            }
        fi
    fi
}

# 创建文件函数
create_file() {
    local file_path="$1"
    local content="$2"
    local description="$3"

    if [ ! -f "$file_path" ]; then
        log_info "创建 $description: $file_path"
        echo -e "$content" > "$file_path"
        log_success "✓ $description 创建完成"
    else
        log_info "$description 已存在: $file_path"
    fi

    # 设置权限
    if [[ $EUID -eq 0 ]]; then
        chmod 666 "$file_path"
    else
        chmod 666 "$file_path" 2>/dev/null || {
            log_warning "无法设置文件权限，请手动设置: chmod 666 $file_path"
        }
    fi
}

# 主初始化函数
main() {
    log_info "开始初始化 Gemini API 代理项目..."
    log_info "项目路径: $(pwd)"

    # 检查权限
    check_permissions

    # 获取当前用户
    CURRENT_USER=$(whoami)
    log_info "当前用户: $CURRENT_USER"

    echo "=========================================="
    log_info "创建项目目录结构..."

    # 创建主要目录
    create_directory "conf.d" "Nginx配置文件"
    create_directory "lua" "Lua脚本文件"
    create_directory "logs" "日志文件"
    create_directory "logs/processed" "处理后的日志"
    create_directory "html" "HTML文件"
    create_directory "ssl" "SSL证书文件"
    create_directory "redis-data" "Redis数据存储"
    create_directory "fluentd" "Fluentd配置"
    create_directory "backups" "备份文件"
    create_directory "temp" "临时文件"

    echo "=========================================="
    log_info "创建必要的配置文件..."

    # 创建空的日志文件
    create_file "logs/gemini_proxy.log" "" "Nginx代理日志"
    create_file "logs/access.log" "" "Nginx访问日志"
    create_file "logs/error.log" "" "Nginx错误日志"
    create_file "logs/redis.log" "" "Redis日志"

    # 创建 .keep 文件保持目录结构
    create_file "conf.d/.keep" "" "conf.d目录占位文件"
    create_file "lua/.keep" "" "lua目录占位文件"
    create_file "html/.keep" "" "html目录占位文件"
    create_file "ssl/.keep" "" "ssl目录占位文件"
    create_file "fluentd/.keep" "" "fluentd目录占位文件"

    # 创建环境配置文件
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            log_info "从 .env.example 复制环境配置文件..."
            cp .env.example .env
            log_success "✓ .env 文件创建完成，请根据需要修改配置"
        else
            log_warning ".env.example 文件不存在，创建基本的 .env 文件..."
            create_file ".env" "# Gemini API 代理环境配置文件\n\n# 真实的 Gemini API Key 列表\nGEMINI_API_KEYS=your_key_1,your_key_2,your_key_3\n\n# 客户端 API Key 列表\nGEMINI_API_KEYS_OLD=client_key_1,client_key_2\n\n# 其他配置...\n" "环境配置文件"
        fi
    else
        log_info ".env 文件已存在"
    fi

    # 创建Docker配置
    if [ ! -f "docker-compose.override.yaml" ]; then
        log_info "创建 Docker 覆盖配置文件..."
        local docker_override_content='version: "3.4"

# 本地开发配置覆盖
services:
  nginx:
    # 开发时可以启用调试模式
    environment:
      - DEBUG=1
    # 开发时可以挂载更多文件用于调试
    volumes:
      - ./debug:/debug:ro
'
        create_file "docker-compose.override.yaml" "$docker_override_content" "Docker覆盖配置"
    fi

    # 创建启动脚本
    local start_script_content='#!/bin/bash

# 快速启动脚本

echo "🚀 启动 Gemini API 代理..."

# 检查配置文件
if [ ! -f "lua/config.lua" ] || [ ! -f "nginx.conf" ]; then
    echo "❌ 配置文件缺失，请先运行 ./init.sh"
    exit 1
fi

# 启动服务
docker-compose up -d

echo "✅ 服务启动完成"
echo "🌐 访问地址: http://localhost:8080"
echo "📊 健康检查: http://localhost:8080/health"
'
    create_file "start.sh" "$start_script_content" "快速启动脚本"
    chmod +x start.sh 2>/dev/null || sudo chmod +x start.sh 2>/dev/null || log_warning "无法设置start.sh执行权限"

    # 创建停止脚本
    local stop_script_content='#!/bin/bash

# 快速停止脚本

echo "🛑 停止 Gemini API 代理..."

docker-compose down

echo "✅ 服务已停止"
'
    create_file "stop.sh" "$stop_script_content" "快速停止脚本"
    chmod +x stop.sh 2>/dev/null || sudo chmod +x stop.sh 2>/dev/null || log_warning "无法设置stop.sh执行权限"

    echo "=========================================="
    log_info "设置文件权限..."

    # 设置所有文件的权限
    if [[ $EUID -eq 0 ]]; then
        find . -type f -name "*.lua" -exec chmod 666 {} \;
        find . -type f -name "*.conf" -exec chmod 666 {} \;
        find . -type f -name "*.html" -exec chmod 666 {} \;
        find . -type f -name "*.yaml" -exec chmod 666 {} \;
        find . -type f -name "*.yml" -exec chmod 666 {} \;
        find . -type f -name ".env*" -exec chmod 600 {} \;  # 环境文件更严格
        log_success "✓ 文件权限设置完成"
    else
        log_info "尝试设置文件权限（可能需要sudo）..."
        find . -type f -name "*.lua" -exec chmod 666 {} \; 2>/dev/null || true
        find . -type f -name "*.conf" -exec chmod 666 {} \; 2>/dev/null || true
        find . -type f -name "*.html" -exec chmod 666 {} \; 2>/dev/null || true
        find . -type f -name "*.yaml" -exec chmod 666 {} \; 2>/dev/null || true
        find . -type f -name "*.yml" -exec chmod 666 {} \; 2>/dev/null || true
        find . -type f -name ".env*" -exec chmod 600 {} \; 2>/dev/null || true
    fi

    echo "=========================================="
    log_info "创建.gitignore文件..."

    # 创建 .gitignore 文件
    local gitignore_content='# 日志文件
logs/*.log
logs/processed/*

# 环境配置
.env
.env.local
.env.production

# SSL证书
ssl/*.pem
ssl/*.key
ssl/*.crt

# Redis数据
redis-data/

# 临时文件
temp/
*.tmp
*.pid

# 备份文件
backups/
*.bak

# 编辑器文件
.vscode/
.idea/
*.swp
*.swo
*~

# 操作系统文件
.DS_Store
Thumbs.db

# Docker相关
docker-compose.override.yaml

# 其他
node_modules/
.npm/
'
    create_file ".gitignore" "$gitignore_content" "Git忽略文件"

    echo "=========================================="
    log_success "🎉 初始化完成！"
    echo ""
    log_info "下一步操作："
    echo "1. 编辑配置文件："
    echo "   - lua/config.lua     # Lua脚本配置"
    echo "   - .env               # 环境变量配置"
    echo "   - nginx.conf         # Nginx主配置"
    echo ""
    echo "2. 配置API Key："
    echo "   在 lua/config.lua 中设置您的真实Gemini API Keys"
    echo "   在 .env 文件中设置环境变量"
    echo ""
    echo "3. 启动服务："
    echo "   ./start.sh           # 快速启动"
    echo "   docker-compose up -d # 直接启动"
    echo "   make up              # 使用Makefile启动"
    echo ""
    echo "4. 访问服务："
    echo "   http://localhost:8080"
    echo "   http://localhost:8080/health"
    echo ""
    log_info "📁 目录结构："
    tree -L 2 2>/dev/null || find . -type d -name ".*" -prune -o -type d -print | head -20
}

# 检查依赖
check_dependencies() {
    local missing_deps=()

    command -v docker >/dev/null 2>&1 || missing_deps+=("docker")
    command -v docker-compose >/dev/null 2>&1 || missing_deps+=("docker-compose")

    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "缺少以下依赖: ${missing_deps[*]}"
        log_info "请安装缺少的依赖后重试"
        exit 1
    fi
}

# 显示帮助信息
show_help() {
    echo "Gemini API 代理项目初始化脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示此帮助信息"
    echo "  -v, --version  显示版本信息"
    echo "  -f, --force    强制重新创建所有目录"
    echo ""
    echo "示例:"
    echo "  $0              # 正常初始化"
    echo "  $0 --force      # 强制初始化"
    echo ""
}

# 版本信息
show_version() {
    echo "Gemini API Proxy Init Script v1.0.0"
}

# 解析命令行参数
FORCE_INIT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--version)
            show_version
            exit 0
            ;;
        -f|--force)
            FORCE_INIT=true
            shift
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

# 强制初始化模式
if [ "$FORCE_INIT" = true ]; then
    log_warning "强制初始化模式：将重新创建所有目录"
    # 这里可以添加强制清理逻辑
fi

# 执行主函数
main "$@"