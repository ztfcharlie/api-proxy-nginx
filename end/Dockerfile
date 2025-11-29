FROM openresty/openresty:1.19.9.1-alpine

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

# 安装更老的兼容 resty.core 版本
RUN cd /tmp && \
    wget https://github.com/openresty/lua-resty-core/archive/refs/tags/v0.1.13.tar.gz && \
    tar -xzf v0.1.13.tar.gz && \
    cp -r lua-resty-core-0.1.13/lib/* /usr/local/openresty/site/lualib/ && \
    rm -rf v0.1.13.tar.gz lua-resty-core-0.1.13

# 安装 lua-resty-lrucache（resty.core 的依赖）
RUN cd /tmp && \
    wget https://github.com/openresty/lua-resty-lrucache/archive/refs/tags/v0.09.tar.gz && \
    tar -xzf v0.09.tar.gz && \
    cp -r lua-resty-lrucache-0.09/lib/* /usr/local/openresty/site/lualib/ && \
    rm -rf v0.09.tar.gz lua-resty-lrucache-0.09

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
