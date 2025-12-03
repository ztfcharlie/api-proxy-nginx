# 使用官方Node.js运行时作为基础镜像
FROM node:18-alpine

# 设置维护者信息
LABEL maintainer="API Proxy Team"
LABEL description="OAuth2 Mock Service for OpenResty AI Proxy"
LABEL version="1.0.0"

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apk add --no-cache \
    curl \
    ca-certificates \
    bash \
    tzdata \
    git \
    && update-ca-certificates

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodejs

# 复制package.json和package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && \
    npm cache clean --force

# 复制应用代码
COPY --chown=nodejs:nodejs . .

# 创建必要的目录
RUN mkdir -p /app/logs /app/tmp /app/client/google_server_account

# 切换到非root用户
USER nodejs

# 暴露端口
EXPOSE 8889 9090

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8889/health || exit 1

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=8889

# 启动命令
CMD ["npm", "start"]