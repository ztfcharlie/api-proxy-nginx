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
    wget https://raw.githubusercontent.com/ledgetech/lua-resty-http/master/lib/resty/http_headers.lua && \
    wget https://raw.githubusercontent.com/ledgetech/lua-resty-http/master/lib/resty/http_connect.lua && \
    mv http*.lua /usr/local/openresty/site/lualib/resty/

# 使用 git 克隆 lua-resty-jwt（更可靠）
RUN cd /tmp && \
    git clone https://github.com/SkyLothar/lua-resty-jwt.git && \
    mkdir -p /usr/local/openresty/site/lualib/resty && \
    cp -r lua-resty-jwt/lib/resty/* /usr/local/openresty/site/lualib/resty/ && \
    rm -rf lua-resty-jwt

# 不安装 resty.core - 使用 lua_load_resty_core off 禁用

# 验证模块
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
