# 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 复制package.json
COPY package.json ./

# 安装所有依赖（包括开发依赖）
RUN npm install

# 生产阶段
FROM node:18-alpine AS production

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

# 从构建阶段复制package.json和package-lock.json
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/package-lock.json ./

# 只安装生产依赖
RUN npm ci --omit=dev && \
    npm cache clean --force

# 复制应用代码
COPY --chown=nodejs:nodejs . .

# 复制启动脚本并设置权限
COPY --chown=nodejs:nodejs entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# 创建必要的目录并设置权限
RUN mkdir -p /app/logs /app/tmp /app/client/google_server_account && \
    chown -R nodejs:nodejs /app

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

# 使用启动脚本
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["npm", "start"]