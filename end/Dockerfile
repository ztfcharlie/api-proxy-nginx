# 使用 OpenResty Alpine Fat 镜像，包含更多预装模块
FROM openresty/openresty:alpine-fat
#FROM openresty/openresty:1.27.1.2-0-jammy

# 设置维护者信息
LABEL maintainer="API Proxy Service"
LABEL description="OpenResty-based API proxy service for Google Vertex AI"

# 安装必要的系统包
RUN apk add --no-cache \
    openssl \
    ca-certificates \
    curl \
    bash \
    tzdata \
    git \
    tar \
    && update-ca-certificates

# 安装lua-resty-http模块
RUN cd /tmp && \
    curl -L -o lua-resty-http.tar.gz https://github.com/ledgetech/lua-resty-http/archive/refs/tags/v0.16.1.tar.gz && \
    tar -xzf lua-resty-http.tar.gz && \
    cd lua-resty-http-* && \
    mkdir -p /usr/local/openresty/lualib/resty && \
    cp lib/resty/http.lua /usr/local/openresty/lualib/resty/ && \
    cp lib/resty/http_headers.lua /usr/local/openresty/lualib/resty/ && \
    cd /tmp && rm -rf lua-resty-http*

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 创建必要的目录
RUN mkdir -p \
    /usr/local/openresty/nginx/conf/conf.d \
    /usr/local/openresty/nginx/lua \
    /usr/local/openresty/nginx/config \
    /usr/local/openresty/nginx/data/json \
    /usr/local/openresty/nginx/data/jwt \
    /usr/local/openresty/nginx/data/map \
    /var/log/nginx \
    /var/cache/nginx \
    /tmp/nginx

# 设置目录权限
RUN chown -R nobody:nobody \
    /usr/local/openresty/nginx/data \
    /var/log/nginx \
    /var/cache/nginx \
    /tmp/nginx

# 复制启动脚本
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

# 测试脚本将在运行时通过挂载卷提供

# 创建 nginx 用户（如果不存在）
RUN addgroup -g 101 -S nginx 2>/dev/null || true
RUN adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx 2>/dev/null || true

# 设置工作目录
WORKDIR /usr/local/openresty/nginx

# 暴露端口
EXPOSE 8080 8443

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# 设置启动命令
CMD ["/usr/local/bin/start.sh"]