# 项目结构说明

## 目录结构

```
D:\www\nginxzhuanfa\end\      # 项目根目录
├── Dockerfile               # Docker 镜像构建文件
├── docker-compose.yml       # Docker Compose 服务编排
├── .env                     # 环境变量配置
├── start.sh                 # 容器启动脚本
├── test-api.sh             # API 测试脚本
├── test-deployment.sh      # 部署测试脚本
├── DOCKER_README.md        # Docker 部署文档
├── PROJECT_STRUCTURE.md    # 项目结构说明（本文件）
├── CLAUDE.md               # 项目总体说明
├── README.md               # 完整项目文档
│
├── nginx/                  # Nginx 配置
│   ├── nginx.conf          # 主配置文件
│   └── conf.d/
│       └── gemini-proxy.conf # 代理服务器配置
│
├── lua/                    # Lua 应用模块
│   ├── config.lua         # 配置管理模块
│   ├── auth_manager.lua   # OAuth2 认证管理
│   ├── stream_handler.lua # 流式请求处理
│   └── utils.lua          # 工具函数
│
├── config/                 # 应用配置文件
│   └── app_config.json    # 应用配置（运行时创建）
│
├── data/                   # 数据文件目录
│   ├── json/              # Google 服务账号凭证
│   ├── jwt/               # OAuth2 令牌缓存
│   └── map/               # 配置映射文件
│       └── map-config.json # 客户端和模型映射（运行时创建）
│
├── logs/                   # 日志文件目录
│   ├── access.log         # 访问日志
│   └── error.log          # 错误日志
│
├── redis/                  # Redis 配置
│   └── redis.conf         # Redis 配置文件
│
├── scripts/                # 管理脚本
│   ├── start-services.sh  # 启动服务脚本
│   ├── stop-services.sh   # 停止服务脚本
│   └── check-services.sh  # 检查服务状态脚本
│
├── ssl/                    # SSL 证书目录（可选）
└── html/                   # 静态文件目录（可选）
```

## 核心文件说明

### Docker 相关

- **Dockerfile**: 基于 `openresty/openresty:alpine-fat` 构建的容器镜像
- **docker-compose.yml**: 定义 API 代理、Redis、Fluentd 服务
- **.env**: 环境变量配置文件
- **start.sh**: 容器内启动脚本，处理初始化和配置检查

### Nginx 配置

- **nginx/nginx.conf**: OpenResty 主配置，包含 Lua 模块路径和共享内存设置
- **nginx/conf.d/gemini-proxy.conf**: API 代理服务器配置，处理路由和认证

### Lua 模块

- **lua/config.lua**: 配置文件读取和管理
- **lua/auth_manager.lua**: OAuth2 认证、令牌管理、客户端验证
- **lua/utils.lua**: 通用工具函数（JWT、Base64、日志等）
- **lua/stream_handler.lua**: 流式请求检测和处理

### 配置文件

- **config/app_config.json**: 应用运行时配置
- **data/map/map-config.json**: 客户端到服务账号的映射配置

### 管理脚本

- **scripts/start-services.sh**: 一键启动所有服务
- **scripts/stop-services.sh**: 停止服务和清理
- **scripts/check-services.sh**: 检查服务状态和健康度
- **test-deployment.sh**: 部署后的完整测试

## 依赖关系

### Lua 模块依赖

```
cjson          # JSON 处理
resty.http     # HTTP 客户端
ngx.*          # OpenResty 内置模块
```

### 系统依赖

```
OpenSSL        # JWT 签名
ca-certificates # SSL 证书验证
curl           # 健康检查
bash           # 脚本执行
```

### 服务依赖

```
Redis          # 缓存和会话存储
Fluentd        # 日志聚合（可选）
```

## 数据流

1. **客户端请求** → nginx 接收
2. **认证阶段** → lua/auth_manager.lua 验证客户端
3. **令牌获取** → 从缓存或 Google OAuth2 获取访问令牌
4. **请求转发** → 代理到 Google API
5. **响应处理** → 流式或标准响应处理
6. **日志记录** → 记录请求详情

## 配置优先级

1. 环境变量（.env 文件）
2. 应用配置文件（config/app_config.json）
3. 默认配置（代码中定义）

## 部署流程

1. **准备配置**: 创建必要的配置文件和目录
2. **构建镜像**: `docker-compose build`
3. **启动服务**: `docker-compose up -d`
4. **验证部署**: 运行 `test-deployment.sh`
5. **配置客户端**: 添加服务账号和客户端映射
6. **测试 API**: 使用 `test-api.sh` 测试代理功能