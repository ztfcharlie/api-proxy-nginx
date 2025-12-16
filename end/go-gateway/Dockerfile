# Build Stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# 设置 Go 代理，加速下载
ENV GOPROXY=https://goproxy.cn,direct

# 复制依赖定义
COPY go.mod go.sum ./
RUN go mod download

# 复制源代码
COPY . .

# 编译
RUN CGO_ENABLED=0 GOOS=linux go build -o gateway ./cmd/gateway

# Run Stage
FROM alpine:latest

WORKDIR /app

# 安装必要的系统库（如果有需要）和时区数据
RUN apk --no-cache add ca-certificates tzdata

# 复制编译好的二进制文件
COPY --from=builder /app/gateway .

# 暴露端口
EXPOSE 8080

# 启动命令
CMD ["./gateway"]
