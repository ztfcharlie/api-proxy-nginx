FROM openresty/openresty:1.21.4.1-alpine

# 安装必要的包
RUN apk add --no-cache \
    wget \
    curl \
    ca-certificates \
    openssl \
    git \
    unzip \
    && update-ca-certificates

# 手动安装 lua-resty-http
RUN mkdir -p /usr/local/openresty/site/lualib/resty && \
    cd /tmp && \
    wget https://raw.githubusercontent.com/ledgetech/lua-resty-http/master/lib/resty/http.lua && \
    mv http.lua /usr/local/openresty/site/lualib/resty/

# 手动安装 lua-resty-jwt
RUN cd /tmp && \
    wget https://raw.githubusercontent.com/SkyLothar/lua-resty-jwt/master/lib/resty/jwt.lua && \
    mv jwt.lua /usr/local/openresty/site/lualib/resty/

# 手动安装 lua-resty-string
RUN mkdir -p /usr/local/openresty/site/lualib/resty && \
    cd /tmp && \
    wget https://raw.githubusercontent.com/openresty/lua-resty-string/master/lib/resty/string.lua && \
    mv string.lua /usr/local/openresty/site/lualib/resty/

# 验证 cjson 模块（通常 OpenResty 已包含）
RUN /usr/local/openresty/luajit/bin/luajit -e "require('cjson'); print('cjson: OK')" || echo "cjson: FAILED"

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