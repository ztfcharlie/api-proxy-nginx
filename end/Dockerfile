FROM alpine:3.18

# 设置环境变量
ENV NGINX_VERSION=1.24.0
ENV LUA_VERSION=5.1.5
ENV LUAJIT_VERSION=2.1-20230410
ENV NGX_DEVEL_KIT_VERSION=0.3.2
ENV LUA_NGINX_MODULE_VERSION=0.10.25

# 安装编译依赖
RUN apk add --no-cache --virtual .build-deps \
    gcc \
    libc-dev \
    make \
    openssl-dev \
    pcre-dev \
    zlib-dev \
    linux-headers \
    curl \
    gnupg \
    libxslt-dev \
    gd-dev \
    geoip-dev \
    wget \
    git \
    unzip

# 安装运行时依赖
RUN apk add --no-cache \
    ca-certificates \
    openssl \
    pcre \
    zlib \
    curl

# 下载并编译 LuaJIT
RUN cd /tmp && \
    wget https://github.com/openresty/luajit2/archive/refs/tags/v${LUAJIT_VERSION}.tar.gz && \
    tar -xzf v${LUAJIT_VERSION}.tar.gz && \
    cd luajit2-${LUAJIT_VERSION} && \
    make && make install PREFIX=/usr/local && \
    ln -sf /usr/local/bin/luajit-2.1.0-beta3 /usr/local/bin/luajit

# 设置 LuaJIT 环境变量
ENV LUAJIT_LIB=/usr/local/lib
ENV LUAJIT_INC=/usr/local/include/luajit-2.1

# 下载 Nginx 和模块
RUN cd /tmp && \
    wget http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz && \
    tar -xzf nginx-${NGINX_VERSION}.tar.gz && \
    wget https://github.com/vision5/ngx_devel_kit/archive/refs/tags/v${NGX_DEVEL_KIT_VERSION}.tar.gz && \
    tar -xzf v${NGX_DEVEL_KIT_VERSION}.tar.gz && \
    wget https://github.com/openresty/lua-nginx-module/archive/refs/tags/v${LUA_NGINX_MODULE_VERSION}.tar.gz && \
    tar -xzf v${LUA_NGINX_MODULE_VERSION}.tar.gz

# 编译 Nginx
RUN cd /tmp/nginx-${NGINX_VERSION} && \
    ./configure \
        --prefix=/etc/nginx \
        --sbin-path=/usr/sbin/nginx \
        --modules-path=/usr/lib/nginx/modules \
        --conf-path=/etc/nginx/nginx.conf \
        --error-log-path=/var/log/nginx/error.log \
        --http-log-path=/var/log/nginx/access.log \
        --pid-path=/var/run/nginx.pid \
        --lock-path=/var/run/nginx.lock \
        --http-client-body-temp-path=/var/cache/nginx/client_temp \
        --http-proxy-temp-path=/var/cache/nginx/proxy_temp \
        --http-fastcgi-temp-path=/var/cache/nginx/fastcgi_temp \
        --http-uwsgi-temp-path=/var/cache/nginx/uwsgi_temp \
        --http-scgi-temp-path=/var/cache/nginx/scgi_temp \
        --with-perl_modules_path=/usr/lib/perl5/vendor_perl \
        --user=nginx \
        --group=nginx \
        --with-compat \
        --with-file-aio \
        --with-threads \
        --with-http_addition_module \
        --with-http_auth_request_module \
        --with-http_dav_module \
        --with-http_flv_module \
        --with-http_gunzip_module \
        --with-http_gzip_static_module \
        --with-http_mp4_module \
        --with-http_random_index_module \
        --with-http_realip_module \
        --with-http_secure_link_module \
        --with-http_slice_module \
        --with-http_ssl_module \
        --with-http_stub_status_module \
        --with-http_sub_module \
        --with-http_v2_module \
        --with-stream \
        --with-stream_realip_module \
        --with-stream_ssl_module \
        --with-stream_ssl_preread_module \
        --add-module=/tmp/ngx_devel_kit-${NGX_DEVEL_KIT_VERSION} \
        --add-module=/tmp/lua-nginx-module-${LUA_NGINX_MODULE_VERSION} && \
    make -j$(nproc) && \
    make install

# 创建 nginx 用户和必要目录
RUN addgroup -g 101 -S nginx && \
    adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx && \
    mkdir -p /var/cache/nginx/client_temp \
             /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp \
             /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp \
             /var/log/nginx \
             /etc/nginx/conf.d \
             /usr/local/lib/lua/5.1 \
             /usr/local/share/lua/5.1

# 安装 Lua 模块
# 安装 lua-cjson
RUN cd /tmp && \
    git clone https://github.com/openresty/lua-cjson.git && \
    cd lua-cjson && \
    make LUA_INCLUDE_DIR=/usr/local/include/luajit-2.1 && \
    make install LUA_CMODULE_DIR=/usr/local/lib/lua/5.1

# 安装 lua-resty-http
RUN cd /tmp && \
    git clone https://github.com/ledgetech/lua-resty-http.git && \
    mkdir -p /usr/local/share/lua/5.1/resty && \
    cp -r lua-resty-http/lib/resty/* /usr/local/share/lua/5.1/resty/

# 安装 lua-resty-jwt
RUN cd /tmp && \
    git clone https://github.com/SkyLothar/lua-resty-jwt.git && \
    cp -r lua-resty-jwt/lib/resty/* /usr/local/share/lua/5.1/resty/

# 清理编译依赖和临时文件
RUN apk del .build-deps && \
    rm -rf /tmp/* /var/cache/apk/*

# 创建项目目录
RUN mkdir -p /etc/nginx/lua \
             /etc/nginx/data \
             /etc/nginx/config \
             /etc/nginx/html \
             /etc/nginx/ssl \
             /var/log/nginx

# 设置工作目录
WORKDIR /etc/nginx

# 暴露端口
EXPOSE 8080 8443

# 启动命令
CMD ["nginx", "-g", "daemon off;"]