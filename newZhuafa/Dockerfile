# 基于 OpenResty Alpine 镜像
FROM openresty/openresty:alpine

# 安装必要的包
RUN apk add --no-cache \
    git \
    curl \
    wget \
    unzip

# 手动安装 lua-resty-jwt 库
RUN cd /usr/local/openresty/lualib && \
    wget https://github.com/SkyLothar/lua-resty-jwt/archive/refs/heads/master.zip && \
    unzip master.zip && \
    cp -r lua-resty-jwt-master/lib/resty/* resty/ && \
    rm -rf master.zip lua-resty-jwt-master

# 创建必要的目录
RUN mkdir -p /usr/local/openresty/nginx/lua
RUN mkdir -p /usr/local/openresty/nginx/logs

# 设置工作目录
WORKDIR /usr/local/openresty/nginx

# 暴露端口
EXPOSE 8080 8443

# 启动命令
CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]