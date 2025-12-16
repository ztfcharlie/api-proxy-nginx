# Go AI Gateway (Unified) - Deployment Guide

## 1. 简介
这是一个 **All-in-One** 的高性能 AI 网关，集成了原有的 Nginx+Lua 网关功能和 go-processor 后台处理功能。
它负责处理所有 API 请求，同时也负责后台的数据同步、Token 刷新和日志入库。

## 2. 核心功能
*   **API 网关**: HTTP 转发、鉴权、智能路由、精准计费、流式解析。
*   **Sync Manager**: 自动将 MySQL 中的渠道/模型配置同步到 Redis。
*   **Token Manager**: 自动刷新 Google/Vertex 的 Service Account Token。
*   **Log Consumer**: 自动消费访问日志并写入 MySQL。

## 3. 编译
确保安装 Go 1.21+。

```bash
cd go-gateway
go mod tidy
go build -o gateway.exe ./cmd/gateway
```

## 4. 配置
环境变量配置 (整合了 Gateway 和 Processor 的配置)：

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `SERVER_PORT` | `8080` | 服务端口 |
| `REDIS_HOST` | `localhost` | Redis 地址 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `REDIS_PASSWORD` | `""` | Redis 密码 |
| `DB_HOST` | `api-proxy-mysql` | MySQL 地址 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USER` | `oauth2_user` | MySQL 用户 |
| `DB_PASSWORD` | `...` | MySQL 密码 |
| `DB_NAME` | `oauth2_mock` | MySQL 数据库名 |

## 5. 运行
```bash
./gateway
```

## 6. 迁移指南
1.  **停止旧服务**: `docker-compose stop nginx go-processor`
2.  **启动新网关**: 确保配置了正确的 Redis 和 MySQL 连接信息。
3.  **检查日志**: 启动后应看到 "Sync Manager started", "Log Consumer started" 等日志。

## 7. 目录结构
*   `cmd/gateway`: 主入口。
*   `internal/processor`: 后台 Worker (Sync, Token, Log)。
*   `internal/billing`: 计费核心。
*   `internal/service`: 网关服务逻辑。