# Build Stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# 预先复制 go.mod 以利用缓存
COPY go.mod ./
# 下载依赖 (如果有 go.sum 也应该复制，目前没有)
RUN go mod download

# 复制源码
COPY . .

# 编译静态二进制文件
# CGO_ENABLED=0 确保不依赖 libc，可以直接在 scratch/alpine 运行
RUN CGO_ENABLED=0 GOOS=linux go build -o log-processor .

# Run Stage
FROM alpine:latest

WORKDIR /app

# 安装基础 CA 证书 (用于连接 HTTPS 或 TLS Redis)
RUN apk --no-cache add ca-certificates tzdata

# 从构建层复制二进制文件
COPY --from=builder /app/log-processor .

# 设置时区
ENV TZ=Asia/Shanghai

CMD ["./log-processor"]
