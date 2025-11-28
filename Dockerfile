# 使用官方稳定的 Nginx 版本
FROM nginx:1.26.1-stable

# 设置环境变量
ENV TZ=Asia/Shanghai

# 安装必要的软件包
RUN apt-get update && \
    apt-get install -y \
    curl \
    lua5.1 \
    lua-cjson \
    lua-redis \
    ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 创建必要的目录
RUN mkdir -p /var/log/nginx /etc/nginx/lua /usr/share/nginx/html

# 复制配置文件
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/
COPY lua/ /etc/nginx/lua/
COPY html/ /usr/share/nginx/html/

# 设置日志目录权限
RUN touch /var/log/nginx/gemini_proxy.log && \
    chown -R nginx:nginx /var/log/nginx && \
    chmod -R 755 /var/log/nginx

# 创建 pid 文件目录
RUN mkdir -p /var/run/nginx

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# 暴露端口
EXPOSE 8080 8443

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]