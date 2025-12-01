#!/bin/bash

# API Proxy 部署脚本
# 用于在服务器上快速部署和启动服务

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 未安装"
        return 1
    fi
    return 0
}

# 显示帮助信息
show_help() {
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════════════════╗
║                     API Proxy 一键部署脚本 v1.0                              ║
║                  OpenResty + Lua + Redis 代理服务                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

📖 功能说明
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
本脚本用于快速部署和管理基于 OpenResty 的 API 代理服务。

核心功能：
  • 自动检查部署环境（Docker、配置文件等）
  • 一键构建 Docker 镜像
  • 自动启动/停止/重启服务
  • 实时查看服务状态和日志
  • 自动化测试服务功能
  • 清理容器和镜像

服务特性：
  • Lazy Loading - Token 按需获取，避免启动失败
  • 多服务支持 - 通过前缀识别服务类型（gemini-, claude-）
  • 权重负载均衡 - 多服务账号智能分配
  • 三级缓存 - 内存 → 文件 → OAuth2 API

🚀 使用方法
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
用法: ./deploy.sh [命令]

📋 可用命令
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  check       检查部署环境和配置文件
              - 验证 Docker 和 Docker Compose 是否安装
              - 检查必需的配置文件是否存在
              - 验证 JSON 配置格式
              - 创建必要的目录并设置权限

  build       构建 Docker 镜像
              - 使用 openresty/openresty:alpine-fat 基础镜像
              - 安装必需的 Lua 模块（lua-resty-http）
              - 配置健康检查和日志

  start       启动服务（包含 check + build）
              - 自动检查环境
              - 构建镜像（如果需要）
              - 启动 OpenResty 和 Redis 容器
              - 等待服务就绪并显示访问地址

  stop        停止服务
              - 优雅停止所有容器
              - 保留数据和配置

  restart     重启服务
              - 快速重启容器
              - 适用于配置更新后

  status      查看服务状态
              - 显示容器运行状态
              - 显示资源使用情况（CPU、内存）

  logs        查看实时日志
              - 实时显示最近 100 行日志
              - 按 Ctrl+C 退出

  test        测试服务功能
              - 测试健康检查端点
              - 测试状态端点
              - 测试 API 请求转发
              - 显示最近的日志

  clean       清理容器和镜像
              - 停止并删除所有容器
              - 删除构建的镜像
              - 清理 Token 缓存
              - ⚠️  需要确认操作

  help        显示此帮助信息

💡 使用示例
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  首次部署（推荐流程）：
    ./deploy.sh check      # 1. 检查环境
    ./deploy.sh start      # 2. 启动服务（自动构建）
    ./deploy.sh test       # 3. 测试功能

  日常维护：
    ./deploy.sh status     # 查看服务状态
    ./deploy.sh logs       # 查看日志
    ./deploy.sh restart    # 重启服务

  配置更新后：
    vim data/map/map-config.json    # 修改配置
    ./deploy.sh restart              # 重启生效

  故障排查：
    ./deploy.sh logs       # 查看日志
    ./deploy.sh test       # 运行测试
    ./deploy.sh status     # 查看状态

📁 项目结构
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  必需文件：
    ├── Dockerfile.new                # Docker 镜像配置
    ├── docker-compose.new.yml        # 服务编排配置
    ├── nginx/nginx.conf              # Nginx 主配置
    ├── nginx/conf.d/*.conf           # 代理配置
    ├── lua/*.lua                     # Lua 脚本
    ├── data/map/map-config.json      # 统一配置文件 ⭐
    └── data/json/*.json              # 服务账号凭证

  自动创建：
    ├── logs/                         # 日志目录
    ├── data/jwt/                     # Token 缓存
    └── redis-data/                   # Redis 数据

🌐 服务端口
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  8888  - HTTP API 端口
  8443  - HTTPS 端口（可选）
  6379  - Redis 端口（内部）

  访问地址：
    健康检查: http://localhost:8888/health
    状态查询: http://localhost:8888/status
    API 代理: http://localhost:8888/v1/...

📚 相关文档
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  README_DEPLOYMENT.md              - 文档总览
  SERVER_DEPLOYMENT.md              - 快速部署指南
  PRE_DEPLOYMENT_CHECKLIST.md       - 部署前检查清单
  DEPLOYMENT_GUIDE.md               - 详细部署指南
  data/map/README-NEW-CONFIG.md     - 配置文件说明
  TESTING_CHECKLIST.md              - 测试清单

⚠️  注意事项
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. 首次部署前请确保 data/map/map-config.json 配置正确
  2. 确保 data/json/ 目录下有有效的服务账号文件
  3. 端口 8888 和 6379 未被占用
  4. 服务器能访问 Google OAuth2 API (https://oauth2.googleapis.com)
  5. 配置更新后需要重启服务才能生效

🆘 获取帮助
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  查看日志:     ./deploy.sh logs
  运行测试:     ./deploy.sh test
  查看文档:     cat SERVER_DEPLOYMENT.md
  故障排查:     cat DEPLOYMENT_GUIDE.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
版本: v1.0  |  基于: OpenResty + Lua + Redis  |  许可: MIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
}

# 检查环境
check_environment() {
    print_info "检查部署环境..."
    echo ""

    # 定义要创建的目录列表
    directories=(
        "redis-data"
        "nginx-logs"
        "nginx"
        "nginx/conf.d"
        "lua"
        "logs"
        "html"
        "ssl"
        "data"
        "config"
    )

    # 创建目录
    echo "开始创建目录..."
    for dir in "${directories[@]}"; do
        mkdir -p "$dir"
        echo "已创建: $dir"
    done

    # 授予权限
    echo "开始授予权限..."
    chmod -R 777 redis-data nginx lua logs html ssl data config
    echo "已授予所有目录777权限"

    echo "完成！所有目录已创建并授权"

    # 检查 Docker
    if check_command docker; then
        DOCKER_VERSION=$(docker --version)
        print_success "Docker 已安装: $DOCKER_VERSION"
    else
        print_error "请先安装 Docker"
        exit 1
    fi

    # 检查 Docker Compose
    if docker compose version &> /dev/null; then
        COMPOSE_VERSION=$(docker compose version)
        print_success "Docker Compose 已安装: $COMPOSE_VERSION"
    else
        print_error "请先安装 Docker Compose V2"
        print_info "提示: Docker Compose V2 已集成到 Docker CLI 中"
        exit 1
    fi

    # 检查 Docker 是否运行
    if docker info &> /dev/null; then
        print_success "Docker 服务正在运行"
    else
        print_error "Docker 服务未运行，请启动 Docker"
        exit 1
    fi

    echo ""
    print_info "检查配置文件..."
    echo ""

    # 检查必需的配置文件
    local required_files=(
        "data/map/map-config.json"
        "nginx/nginx.conf"
        "nginx/conf.d/gemini-proxy.conf"
        "Dockerfile.new"
        "docker-compose.new.yml"
    )

    local missing_files=0
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            print_success "✓ $file"
        else
            print_error "✗ $file (缺失)"
            missing_files=$((missing_files + 1))
        fi
    done

    if [ $missing_files -gt 0 ]; then
        print_error "缺少 $missing_files 个必需文件"
        exit 1
    fi

    echo ""
    print_info "验证 JSON 配置..."
    echo ""

    # 验证 JSON 格式
    if check_command jq; then
        if jq empty data/map/map-config.json 2>/dev/null; then
            print_success "map-config.json 格式正确"
        else
            print_error "map-config.json 格式错误"
            exit 1
        fi
    elif check_command python3; then
        if python3 -m json.tool data/map/map-config.json > /dev/null 2>&1; then
            print_success "map-config.json 格式正确"
        else
            print_error "map-config.json 格式错误"
            exit 1
        fi
    else
        print_warning "无法验证 JSON 格式（jq 和 python3 都未安装）"
    fi

    echo ""
    print_info "检查目录权限..."
    echo ""

    # 创建必要的目录
    mkdir -p logs data/jwt redis-data

    # 检查权限
    if [ -w "data/jwt" ]; then
        print_success "data/jwt 目录可写"
    else
        print_warning "data/jwt 目录不可写，尝试修复..."
        chmod -R 755 data/jwt
    fi

    if [ -w "logs" ]; then
        print_success "logs 目录可写"
    else
        print_warning "logs 目录不可写，尝试修复..."
        chmod -R 755 logs
    fi

    echo ""
    print_success "环境检查完成！"
}

# 构建镜像
build_images() {
    print_info "准备构建 Docker 镜像..."
    echo ""

    # 复制新配置文件
    if [ ! -f "docker-compose.yml" ] || [ "docker-compose.new.yml" -nt "docker-compose.yml" ]; then
        print_info "使用新的 docker-compose 配置..."
        cp docker-compose.new.yml docker-compose.yml
    fi

    if [ ! -f "Dockerfile" ] || [ "Dockerfile.new" -nt "Dockerfile" ]; then
        print_info "使用新的 Dockerfile..."
        cp Dockerfile.new Dockerfile
    fi

    print_info "开始构建镜像（这可能需要几分钟）..."
    docker compose build

    print_success "镜像构建完成！"
}

# 启动服务
start_services() {
    print_info "启动服务..."
    echo ""

    # 确保使用新配置
    if [ ! -f "docker-compose.yml" ]; then
        cp docker-compose.new.yml docker-compose.yml
    fi

    docker compose up -d

    echo ""
    print_info "等待服务启动（30秒）..."
    sleep 30

    echo ""
    print_info "检查服务状态..."
    docker compose ps

    echo ""
    print_success "服务已启动！"
    echo ""
    print_info "访问地址:"
    echo "  - 健康检查: http://localhost:8888/health"
    echo "  - 状态检查: http://localhost:8888/status"
    echo ""
    print_info "查看日志: $0 logs"
}

# 停止服务
stop_services() {
    print_info "停止服务..."
    docker compose stop
    print_success "服务已停止！"
}

# 重启服务
restart_services() {
    print_info "重启服务..."
    docker compose restart
    echo ""
    print_info "等待服务启动（20秒）..."
    sleep 20
    print_success "服务已重启！"
}

# 查看状态
show_status() {
    print_info "服务状态:"
    echo ""
    docker compose ps
    echo ""

    print_info "容器资源使用:"
    echo ""
    docker stats --no-stream api-proxy-nginx api-proxy-redis 2>/dev/null || true
}

# 查看日志
show_logs() {
    print_info "查看日志（Ctrl+C 退出）..."
    echo ""
    docker compose logs -f --tail=100
}

# 测试服务
test_services() {
    print_info "测试服务..."
    echo ""

    # 测试健康检查
    print_info "1. 测试健康检查端点..."
    if curl -f -s http://localhost:8888/health > /dev/null; then
        print_success "健康检查通过"
        curl -s http://localhost:8888/health | jq . 2>/dev/null || curl -s http://localhost:8888/health
    else
        print_error "健康检查失败"
    fi

    echo ""

    # 测试状态端点
    print_info "2. 测试状态端点..."
    if curl -f -s http://localhost:8888/status > /dev/null; then
        print_success "状态检查通过"
        curl -s http://localhost:8888/status | jq . 2>/dev/null || curl -s http://localhost:8888/status
    else
        print_error "状态检查失败"
    fi

    echo ""

    # 测试 API 请求
    print_info "3. 测试 API 请求（使用 gemini-client-key-aaaa）..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent \
        -H "Authorization: Bearer gemini-client-key-aaaa" \
        -H "Content-Type: application/json" \
        -d '{"contents":[{"parts":[{"text":"test"}]}]}')

    if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "400" ] || [ "$HTTP_CODE" == "401" ]; then
        print_success "API 请求已转发（HTTP $HTTP_CODE）"
        print_info "注意: 如果返回 401/400，可能是服务账号配置问题"
    elif [ "$HTTP_CODE" == "403" ]; then
        print_warning "客户端被禁用或未授权（HTTP 403）"
    else
        print_error "API 请求失败（HTTP $HTTP_CODE）"
    fi

    echo ""
    print_info "查看最近的日志:"
    docker compose logs --tail=20 api-proxy-nginx
}

# 清理
clean_all() {
    print_warning "这将删除所有容器、镜像和数据！"
    read -p "确定要继续吗？(yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        print_info "取消清理"
        exit 0
    fi

    print_info "停止并删除容器..."
    docker compose down -v

    print_info "删除镜像..."
    docker rmi end_api-proxy-nginx 2>/dev/null || true

    print_info "清理缓存..."
    rm -rf data/jwt/*.json

    print_success "清理完成！"
}

# 主函数
main() {
    case "${1:-help}" in
        check)
            check_environment
            ;;
        build)
            check_environment
            build_images
            ;;
        start)
            check_environment
            build_images
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
        test)
            test_services
            ;;
        clean)
            clean_all
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "未知命令: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"
