FROM openresty/openresty:1.27.1.2-0-focal

# 安装必要的包（使用 apt 而不是 apk）
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    openssl \
    git \
    unzip \
    && update-ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 手动安装 lua-resty-http
RUN mkdir -p /usr/local/openresty/site/lualib/resty && \
    cd /tmp && \
    wget https://raw.githubusercontent.com/ledgetech/lua-resty-http/master/lib/resty/http.lua && \
    wget https://raw.githubusercontent.com/ledgetech/lua-resty-http/master/lib/resty/http_headers.lua && \
    wget https://raw.githubusercontent.com/ledgetech/lua-resty-http/master/lib/resty/http_connect.lua && \
    mv http*.lua /usr/local/openresty/site/lualib/resty/

# 手动安装 lua-resty-jwt（简化版本，只安装核心文件）
RUN cd /tmp && \
    wget https://raw.githubusercontent.com/SkyLothar/lua-resty-jwt/master/lib/resty/jwt.lua && \
    wget https://raw.githubusercontent.com/SkyLothar/lua-resty-jwt/master/lib/resty/evp.lua && \
    mkdir -p /usr/local/openresty/site/lualib/resty/jwt && \
    wget -P /usr/local/openresty/site/lualib/resty/jwt/ https://raw.githubusercontent.com/SkyLothar/lua-resty-jwt/master/lib/resty/jwt/validators.lua && \
    mv jwt.lua evp.lua /usr/local/openresty/site/lualib/resty/

# 验证模块
RUN /usr/local/openresty/luajit/bin/luajit -e "require('cjson'); print('cjson: OK')" || echo "cjson: FAILED" && \
    /usr/local/openresty/luajit/bin/luajit -e "require('resty.core'); print('resty.core: OK')" || echo "resty.core: FAILED" && \
    /usr/local/openresty/luajit/bin/luajit -e "require('resty.string'); print('resty.string: OK')" || echo "resty.string: FAILED"

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
