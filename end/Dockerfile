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
