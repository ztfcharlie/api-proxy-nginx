#!/bin/bash

# 修复并重新构建容器
# 解决 Lua 模块加载问题

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info "开始修复 Lua 模块加载问题..."
echo ""

# 1. 停止现有容器
print_info "1. 停止现有容器..."
docker compose down

# 2. 备份当前 Dockerfile
print_info "2. 备份当前 Dockerfile..."
cp Dockerfile Dockerfile.backup.$(date +%Y%m%d_%H%M%S)

# 3. 更新 Dockerfile，添加 COPY nginx.conf
print_info "3. 更新 Dockerfile..."
cat > Dockerfile << 'EOF'
FROM openresty/openresty:alpine-fat

# 设置维护者信息
LABEL maintainer="API Proxy Team"
LABEL description="OpenResty-based API Proxy for Google Vertex AI"

# 设置环境变量
ENV TZ=Asia/Shanghai \
    LANG=C.UTF-8

# 安装必要的系统工具和依赖
RUN apk add --no-cache \
    ca-certificates \
    openssl \
    curl \
    wget \
    bash \
    tzdata \
    jq \
    && cp /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo "${TZ}" > /etc/timezone

# 安装 Lua 模块
# lua-cjson 已经包含在 openresty:alpine-fat 中
# lua-resty-http 需要安装
RUN /usr/local/openresty/luajit/bin/luarocks install lua-resty-http

# 创建必要的目录结构
RUN mkdir -p /etc/nginx/lua \
             /etc/nginx/conf.d \
             /etc/nginx/data/map \
             /etc/nginx/data/json \
             /etc/nginx/data/jwt \
             /etc/nginx/config \
             /etc/nginx/html \
             /etc/nginx/ssl \
             /var/log/nginx \
             /var/cache/nginx/client_temp \
             /var/cache/nginx/proxy_temp

# 设置目录权限
RUN chown -R nobody:nobody /etc/nginx/data \
    && chown -R nobody:nobody /var/log/nginx \
    && chown -R nobody:nobody /var/cache/nginx \
    && chmod -R 755 /etc/nginx/data \
    && chmod -R 755 /var/log/nginx

# ⭐ 关键修复：先 COPY nginx.conf 到镜像中
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# 创建健康检查脚本
RUN echo '#!/bin/sh' > /usr/local/bin/healthcheck.sh && \
    echo 'curl -f http://localhost:8080/health || exit 1' >> /usr/local/bin/healthcheck.sh && \
    chmod +x /usr/local/bin/healthcheck.sh

# 设置工作目录
WORKDIR /etc/nginx

# 暴露端口
EXPOSE 8080 8443

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD /usr/local/bin/healthcheck.sh

# 启动命令
CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]
EOF

print_success "Dockerfile 已更新"

# 4. 验证 nginx.conf 中的 lua_package_path
print_info "4. 验证 nginx.conf 配置..."
if grep -q 'lua_package_path "/etc/nginx/lua/?.lua' nginx/nginx.conf; then
    print_success "nginx.conf 中的 lua_package_path 配置正确"
else
    print_error "nginx.conf 中的 lua_package_path 配置不正确"
    exit 1
fi

# 5. 重新构建镜像
print_info "5. 重新构建镜像（这可能需要几分钟）..."
docker compose build --no-cache

# 6. 启动服务
print_info "6. 启动服务..."
docker compose up -d

# 7. 等待服务启动
print_info "7. 等待服务启动（30秒）..."
sleep 30

# 8. 验证修复
print_info "8. 验证修复..."
echo ""

print_info "检查容器状态..."
docker compose ps

echo ""
print_info "检查 Lua 模块是否加载成功..."
docker compose logs api-proxy-nginx | grep -i "modules loaded" || true

echo ""
print_info "测试 /status 端点..."
curl -s http://localhost:8888/status | jq . || curl -s http://localhost:8888/status

echo ""
echo ""
print_success "修复完成！"
echo ""
print_info "如果仍有问题，请运行以下命令查看日志："
echo "  docker compose logs -f api-proxy-nginx"
