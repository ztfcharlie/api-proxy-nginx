# 基于 OpenResty Alpine 镜像
FROM openresty/openresty:alpine

# 安装必要的包 (包括 OpenSSL 开发包)
RUN apk add --no-cache \
    git \
    curl \
    wget \
    unzip \
    openssl-dev \
    gcc \
    musl-dev \
    make

# 手动安装 lua-resty-http 库
RUN cd /usr/local/openresty/lualib && \
    wget https://github.com/ledgetech/lua-resty-http/archive/refs/heads/master.zip -O lua-resty-http.zip && \
    unzip lua-resty-http.zip && \
    cp -r lua-resty-http-master/lib/resty/* resty/ && \
    rm -rf lua-resty-http.zip lua-resty-http-master

# 手动安装 lua-resty-string 库 (JWT 依赖)
RUN cd /usr/local/openresty/lualib && \
    wget https://github.com/openresty/lua-resty-string/archive/refs/heads/master.zip -O lua-resty-string.zip && \
    unzip lua-resty-string.zip && \
    cp -r lua-resty-string-master/lib/resty/* resty/ && \
    rm -rf lua-resty-string.zip lua-resty-string-master

# 手动安装 lua-resty-hmac 库 (JWT 依赖)
RUN cd /usr/local/openresty/lualib && \
    wget https://github.com/jkeys089/lua-resty-hmac/archive/refs/heads/master.zip -O lua-resty-hmac.zip && \
    unzip lua-resty-hmac.zip && \
    cp -r lua-resty-hmac-master/lib/resty/* resty/ && \
    rm -rf lua-resty-hmac.zip lua-resty-hmac-master

# 手动安装 lua-resty-openssl 库 (消除 mTLS 警告)
RUN cd /usr/local/openresty/lualib && \
    wget https://github.com/fffonion/lua-resty-openssl/archive/refs/heads/master.zip -O lua-resty-openssl.zip && \
    unzip lua-resty-openssl.zip && \
    cp -r lua-resty-openssl-master/lib/resty/* resty/ && \
    rm -rf lua-resty-openssl.zip lua-resty-openssl-master

# 安装兼容的 lua-resty-jwt 库 (使用 cdbattags 版本，支持新版 OpenSSL)
RUN cd /usr/local/openresty/lualib && \
    wget https://github.com/cdbattags/lua-resty-jwt/archive/refs/heads/master.zip -O lua-resty-jwt-new.zip && \
    unzip lua-resty-jwt-new.zip && \
    cp -r lua-resty-jwt-master/lib/resty/* resty/ && \
    rm -rf lua-resty-jwt-new.zip lua-resty-jwt-master

# 验证安装的模块
RUN echo "验证安装的 Lua 模块:" && \
    ls -la /usr/local/openresty/lualib/resty/ | grep -E "(http|jwt|hmac|string|openssl)" || true && \
    echo "OpenSSL 相关模块:" && \
    find /usr/local/openresty/lualib/resty/ -name "*openssl*" -type f | head -5 || true

# 创建必要的目录
RUN mkdir -p /usr/local/openresty/nginx/lua
RUN mkdir -p /usr/local/openresty/nginx/logs

# 设置工作目录
WORKDIR /usr/local/openresty/nginx

# 暴露端口
EXPOSE 8080 8443

# 启动命令
CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]