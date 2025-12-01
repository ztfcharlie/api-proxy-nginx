# 构建参数（与 docker-compose.yml 中的 args 对应）
ARG OPENRESTY_VERSION=alpine-fat
FROM openresty/openresty:${OPENRESTY_VERSION}

# 元数据标签（更规范）
LABEL maintainer="API Proxy Team"
LABEL description="OpenResty-based API Proxy for Google Vertex AI"
LABEL version="1.0.0"

# 环境变量（可通过 docker-compose 覆盖）
ENV TZ=Asia/Shanghai \
    LANG=C.UTF-8 \
    NGINX_HOME=/etc/nginx \
    OPENRESTY_HOME=/usr/local/openresty \
    LUA_PATH="$LUA_PATH;/etc/nginx/lua/?.lua;/etc/nginx/lua/?/init.lua" \
    LUA_CPATH="$LUA_CPATH;/etc/nginx/lua/?.so"

# 安装系统依赖（精简必要工具，减少镜像体积）
RUN apk add --no-cache \
    ca-certificates \
    openssl \
    curl \
    bash \
    tzdata \
    jq \
    && : "设置时区" \
    && cp /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo "${TZ}" > /etc/timezone \
    && : "清理 apk 缓存（进一步减小体积）" \
    && rm -rf /var/cache/apk/*

# 安装 Lua 依赖（优化安装命令，增加版本锁定）
RUN : "安装 lua-resty-http（指定稳定版本）" \
    && ${OPENRESTY_HOME}/luajit/bin/luarocks install lua-resty-http 0.17.1 \
    && : "安装 lua-resty-jwt（适配 JWT 验证场景）" \
    && ${OPENRESTY_HOME}/luajit/bin/luarocks install lua-resty-jwt 0.2.2 \
    && : "安装 lua-resty-redis（Redis 客户端，适配缓存场景）" \
    && ${OPENRESTY_HOME}/luajit/bin/luarocks install lua-resty-redis 0.27 \
    && : "清理 luarocks 缓存" \
    && rm -rf ${OPENRESTY_HOME}/luajit/lib/luarocks/cache/*

# 创建目录结构（与 docker-compose 挂载目录对齐，设置合理权限）
RUN mkdir -p \
    ${NGINX_HOME}/lua \
    ${NGINX_HOME}/conf.d \
    ${NGINX_HOME}/data/map \
    ${NGINX_HOME}/data/json \
    ${NGINX_HOME}/data/jwt \
    ${NGINX_HOME}/config \
    ${NGINX_HOME}/html \
    ${NGINX_HOME}/ssl \
    /var/log/nginx \
    /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    && : "设置目录权限（遵循最小权限原则）" \
    && chown -R nobody:nobody \
        ${NGINX_HOME}/data \
        /var/log/nginx \
        /var/cache/nginx \
    && chmod -R 700 ${NGINX_HOME}/data/jwt \  # JWT 目录更严格（仅所有者可读写）
    && chmod -R 755 \
        ${NGINX_HOME}/data/map \
        ${NGINX_HOME}/data/json \
        /var/log/nginx \
        /var/cache/nginx \
    && chmod -R 744 \
        ${NGINX_HOME}/lua \
        ${NGINX_HOME}/conf.d \
        ${NGINX_HOME}/config \
        ${NGINX_HOME}/html \
        ${NGINX_HOME}/ssl

# 健康检查脚本（优化逻辑，增加容错性）
RUN echo '#!/bin/bash' > /usr/local/bin/healthcheck.sh \
    && echo 'set -euo pipefail' >> /usr/local/bin/healthcheck.sh \
    && echo '#' >> /usr/local/bin/healthcheck.sh \
    && echo '# 检查 Nginx 进程是否存活' >> /usr/local/bin/healthcheck.sh \
    && echo 'if ! pgrep -x "openresty" > /dev/null; then' >> /usr/local/bin/healthcheck.sh \
    && echo '  echo "OpenResty process not running"' >> /usr/local/bin/healthcheck.sh \
    && echo '  exit 1' >> /usr/local/bin/healthcheck.sh \
    && echo 'fi' >> /usr/local/bin/healthcheck.sh \
    && echo '#' >> /usr/local/bin/healthcheck.sh \
    && echo '# 检查健康接口是否可访问' >> /usr/local/bin/healthcheck.sh \
    && echo 'if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health | grep -q "200"; then' >> /usr/local/bin/healthcheck.sh \
    && echo '  echo "Health check endpoint failed"' >> /usr/local/bin/healthcheck.sh \
    && echo '  exit 1' >> /usr/local/bin/healthcheck.sh \
    && echo 'fi' >> /usr/local/bin/healthcheck.sh \
    && echo 'echo "Health check passed"' >> /usr/local/bin/healthcheck.sh \
    && chmod +x /usr/local/bin/healthcheck.sh

# 优化 Nginx 配置（禁用默认配置，避免冲突）
RUN rm -f ${NGINX_HOME}/conf.d/default.conf \
    && : "设置 OpenResty 启动参数（优化性能）" \
    && echo "worker_processes \${NGINX_WORKER_PROCESSES:-auto};" > ${NGINX_HOME}/nginx.conf.d/worker_processes.conf \
    && echo "user \${NGINX_USER:-nobody};" > ${NGINX_HOME}/nginx.conf.d/user.conf

# 工作目录
WORKDIR ${NGINX_HOME}

# 暴露端口（与 docker-compose 端口映射对齐）
EXPOSE 8080 8443

# 健康检查（与 docker-compose 健康检查逻辑一致，避免重复配置）
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD /usr/local/bin/healthcheck.sh

# 启动命令（优化参数，增加日志输出控制）
CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off; error_log /var/log/nginx/error.log warn;"]