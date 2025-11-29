FROM openresty/openresty:latest-alpine

# 安装必要的包和编译工具
RUN apk add --no-cache \
    wget \
    curl \
    ca-certificates \
    openssl \
    git \
    gcc \
    musl-dev \
    make \
    && update-ca-certificates

# 安装 luarocks（如果不存在）
RUN if [ ! -f /usr/local/openresty/luajit/bin/luarocks ]; then \
        wget https://luarocks.org/releases/luarocks-3.9.2.tar.gz && \
        tar zxpf luarocks-3.9.2.tar.gz && \
        cd luarocks-3.9.2 && \
        ./configure --prefix=/usr/local/openresty/luajit \
            --with-lua=/usr/local/openresty/luajit \
            --lua-suffix=jit-2.1.0-beta3 \
            --with-lua-include=/usr/local/openresty/luajit/include/luajit-2.1 && \
        make && make install && \
        cd .. && rm -rf luarocks-3.9.2*; \
    fi

# 安装必需的 Lua 模块
RUN /usr/local/openresty/luajit/bin/luarocks install lua-cjson
RUN /usr/local/openresty/luajit/bin/luarocks install lua-resty-jwt
RUN /usr/local/openresty/luajit/bin/luarocks install lua-resty-http

# 创建必要的目录
RUN mkdir -p /usr/local/openresty/nginx/logs \
    && mkdir -p /usr/local/openresty/nginx/data \
    && mkdir -p /usr/local/openresty/nginx/config \
    && mkdir -p /usr/local/openresty/nginx/html \
    && mkdir -p /usr/local/openresty/lualib

# 设置工作目录
WORKDIR /usr/local/openresty/nginx

# 暴露端口
EXPOSE 8080 8443

# 重置 ENTRYPOINT 并使用完整路径
ENTRYPOINT []
CMD ["/usr/local/openresty/nginx/sbin/nginx", "-g", "daemon off;"]