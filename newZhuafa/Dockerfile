# 基于 OpenResty Alpine 镜像
FROM openresty/openresty:alpine

# 安装必要的包
RUN apk add --no-cache \
    git \
    openssl-dev \
    gcc \
    musl-dev \
    make

# 安装 luarocks
RUN /usr/local/openresty/luajit/bin/luarocks install lua-resty-jwt

# 安装其他必要的 Lua 库
RUN /usr/local/openresty/luajit/bin/luarocks install lua-cjson

# 创建必要的目录
RUN mkdir -p /usr/local/openresty/nginx/lua
RUN mkdir -p /usr/local/openresty/nginx/logs

# 设置工作目录
WORKDIR /usr/local/openresty/nginx

# 暴露端口
EXPOSE 8080 8443

# 启动命令
CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]