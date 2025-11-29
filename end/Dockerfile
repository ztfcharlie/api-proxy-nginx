FROM openresty/openresty:1.19.9.1-alpine

# 安装必要的包
RUN apk add --no-cache \
    wget \
    curl \
    ca-certificates \
    openssl \
    git \
    gcc \
    musl-dev \
    && update-ca-certificates

# 查找并安装 Lua 依赖
RUN find /usr -name "luarocks" -type f 2>/dev/null || echo "Searching for luarocks..."

# 尝试不同的 luarocks 路径
RUN which luarocks || \
    find /usr -name "luarocks" -type f || \
    ls -la /usr/local/openresty/ || \
    echo "luarocks not found, will skip Lua dependencies"

# 如果找到 luarocks，安装依赖；否则跳过
RUN LUAROCKS_PATH=$(find /usr -name "luarocks" -type f 2>/dev/null | head -1) && \
    if [ -n "$LUAROCKS_PATH" ]; then \
        echo "Found luarocks at: $LUAROCKS_PATH"; \
        $LUAROCKS_PATH install lua-resty-jwt || echo "lua-resty-jwt failed"; \
        $LUAROCKS_PATH install lua-resty-http || echo "lua-resty-http failed"; \
        $LUAROCKS_PATH install lua-cjson || echo "lua-cjson failed"; \
        $LUAROCKS_PATH install lua-resty-string || echo "lua-resty-string failed"; \
    else \
        echo "luarocks not found, skipping Lua dependencies installation"; \
    fi

# 创建必要的目录
RUN mkdir -p /usr/local/openresty/nginx/logs \
    && mkdir -p /usr/local/openresty/nginx/data \
    && mkdir -p /usr/local/openresty/nginx/config \
    && mkdir -p /usr/local/openresty/nginx/html

# 设置工作目录
WORKDIR /usr/local/openresty/nginx

# 暴露端口
EXPOSE 8080 8443

# 启动命令
CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]