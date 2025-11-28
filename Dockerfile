# 使用支持Lua模块的Nginx镜像
FROM openresty/openresty:alpine

# 设置环境变量
ENV TZ=Asia/Shanghai

# 安装必要的软件包
RUN apk add --no-cache \
    curl \
    wget \
    lua5.1 \
    lua5.1-cjson \
    lua5.1-redis \
    ca-certificates

# 创建必要的目录
RUN mkdir -p /usr/local/openresty/nginx/logs \
    && mkdir -p /usr/local/openresty/nginx/conf/conf.d \
    && mkdir -p /usr/local/openresty/lualib \
    && mkdir -p /usr/local/openresty/nginx/html

# 复制配置文件
COPY nginx.conf /usr/local/openresty/nginx/conf/nginx.conf
COPY conf.d/ /usr/local/openresty/nginx/conf/conf.d/
COPY lua/ /usr/local/openresty/lualib/
COPY html/ /usr/local/openresty/nginx/html/

# 设置日志目录权限
RUN touch /usr/local/openresty/nginx/logs/gemini_proxy.log && \
    chown -R nobody:nogroup /usr/local/openresty/nginx/logs && \
    chmod -R 755 /usr/local/openresty/nginx/logs

# 创建 pid 文件目录
RUN mkdir -p /var/run

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# 暴露端口
EXPOSE 8080 8443

# 启动 OpenResty
CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]