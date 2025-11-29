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

# 安装 Lua 依赖（使用更稳定的方式）
RUN /usr/local/openresty/luajit/bin/luarocks install lua-resty-jwt --server=https://luarocks.org/manifests/SkyLothar || \
    /usr/local/openresty/luajit/bin/luarocks install lua-resty-jwt

RUN /usr/local/openresty/luajit/bin/luarocks install lua-resty-http || \
    echo "lua-resty-http installation failed, but continuing..."

RUN /usr/local/openresty/luajit/bin/luarocks install lua-cjson || \
    echo "lua-cjson installation failed, but continuing..."

RUN /usr/local/openresty/luajit/bin/luarocks install lua-resty-string || \
    echo "lua-resty-string installation failed, but continuing..."

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