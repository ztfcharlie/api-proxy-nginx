FROM openresty/openresty:1.15.8.3-alpine

# 安装必要的包
RUN apk add --no-cache \
    wget \
    curl \
    ca-certificates \
    openssl \
    git \
    unzip \
    && update-ca-certificates

# 安装 lua-resty-lrucache（lua-resty-core 的依赖）
RUN cd /tmp && \
    git clone https://github.com/openresty/lua-resty-lrucache.git && \
    cd lua-resty-lrucache && \
    git checkout v0.09 && \
    make install PREFIX=/usr/local/openresty

# 安装 lua-resty-core
RUN cd /tmp && \
    git clone https://github.com/openresty/lua-resty-core.git && \
    cd lua-resty-core && \
    git checkout v0.1.17 && \
    make install PREFIX=/usr/local/openresty

# 手动安装 lua-resty-http
RUN cd /tmp && \
    git clone https://github.com/ledgetech/lua-resty-http.git && \
    cp -r lua-resty-http/lib/resty/* /usr/local/openresty/site/lualib/resty/

# 手动安装 lua-resty-jwt
RUN cd /tmp && \
    git clone https://github.com/SkyLothar/lua-resty-jwt.git && \
    cp -r lua-resty-jwt/lib/resty/* /usr/local/openresty/site/lualib/resty/

# 清理
RUN rm -rf /tmp/*

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
