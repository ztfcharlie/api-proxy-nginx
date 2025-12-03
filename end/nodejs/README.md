# Node.js OAuth2 模拟服务 - 完整开发文档

## 📋 项目概述

基于现有的 OpenResty AI 代理服务，开发一个完整的 **Node.js OAuth2 模拟系统**，用于在测试/开发环境中模拟 Google OAuth2 认证流程，避免实际连接到 Google Cloud。

### 系统架构

```
客户端 → OpenResty (8888) → Node.js OAuth2模拟服务 (8889) → MySQL
    ↓                      ↓                    ↓
  AI API请求            OAuth2认证模拟        数据持久化
    ↓                      ↓                    ↓
  Redis缓存             JWT认证管理         管理界面数据
    ↓                      ↓                    ↓
  日志记录               令牌映射关系        统计分析数据
```

### 核心功能

- **标准 OAuth2 模拟**: 完全兼容 Google OAuth2 API 规范
- **多种授权流程**: Authorization Code, Client Credentials, JWT Bearer, Refresh Token
- **服务账号管理**: 模拟 Google 服务账号的创建和管理
- **令牌映射系统**: 内部 client_token ↔ 外部 Google access_token 映射
- **高性能缓存**: Redis + 内存多层缓存架构
- **完整监控**: 日志记录、性能监控、健康检查
- **Web 管理界面**: React + Tailwind CSS 管理后台

## 📁 项目结构

```
nodejs/
├── package.json                    # 项目依赖和脚本
├── .env.example                    # 环境变量模板
├── Dockerfile                       # Node.js服务镜像构建
├── pm2.config.js                   # PM2进程管理配置
├── README.md                       # 项目说明文档
│
├── server/                          # Node.js后端服务
│   ├── app.js                      # Express应用主入口
│   ├── config/                     # 配置文件目录
│   │   ├── database.js             # 数据库连接配置
│   │   ├── redis.js                # Redis连接配置
│   │   └── oauth2.js               # OAuth2服务配置
│   ├── services/                   # 业务逻辑服务层
│   │   ├── DatabaseService.js      # 数据库操作服务
│   │   ├── RedisService.js         # Redis缓存服务
│   │   ├── OAuth2Service.js       # OAuth2认证核心服务
│   │   ├── TokenService.js         # 令牌映射和管理服务
│   │   └── LoggerService.js       # 日志记录服务
│   ├── middleware/                 # Express中间件
│   │   ├── auth.js                 # 认证中间件
│   │   ├── logging.js              # 日志中间件
│   │   └── errorHandler.js         # 错误处理中间件
│   ├── routes/                     # API路由层
│   │   ├── oauth2.js               # OAuth2模拟API端点
│   │   ├── admin.js                # 管理界面API
│   │   ├── clients.js              # 客户端管理API
│   │   ├── serverAccounts.js       # 服务账号管理API
│   │   └── health.js               # 健康检查API
│   ├── models/                     # 数据模型层
│   │   ├── Client.js               # 客户端模型
│   │   ├── ServerAccount.js        # 服务账号模型
│   │   └── TokenMapping.js         # 令牌映射模型
│   ├── utils/                      # 工具函数库
│   │   ├── jwt.js                  # JWT处理工具
│   │   ├── crypto.js               # 加密工具
│   │   ├── file.js                 # 文件操作工具
│   │   └── validation.js           # 参数验证工具
│   └── tests/                      # 测试文件
│       ├── unit/                   # 单元测试
│       ├── integration/            # 集成测试
│       └── fixtures/               # 测试数据
│
├── client/                         # React前端应用（可选）
│   ├── public/                     # 静态资源
│   ├── src/                        # 源代码
│   │   ├── components/              # React组件
│   │   ├── pages/                   # 页面组件
│   │   ├── services/               # API调用服务
│   │   ├── utils/                   # 前端工具函数
│   │   └── hooks/                   # React Hooks
│   ├── package.json               # 前端依赖
│   ├── tailwind.config.js         # Tailwind CSS配置
│   └── webpack.config.js          # 打包配置
│
├── database/                       # 数据库相关文件
│   ├── schema.sql                  # MySQL数据库结构
│   ├── migrations/                 # 数据库迁移脚本
│   └── seeds/                      # 初始数据
│
├── docker/                         # Docker相关文件
│   ├── Dockerfile                 # Node.js服务镜像
│   ├── nginx.conf                 # Nginx配置
│   └── entrypoint.sh             # 容器启动脚本
│
├── docs/                          # 项目文档
│   ├── API.md                     # API接口文档
│   ├── DEPLOYMENT.md              # 部署指南
│   ├── DEVELOPMENT.md             # 开发指南
│   └── ARCHITECTURE.md            # 系统架构文档
│
└── logs/                          # 日志文件目录
    ├── oauth2/                   # OAuth2专用日志
    ├── access.log               # 访问日志
    ├── error.log                # 错误日志
    └── debug.log               # 调试日志
```

## 🚀 快速开始

### 1. 环境准备

```bash
# 进入项目目录
cd D:\www\nginxzhuanfa\end\nodejs

# 安装依赖
npm install

# 复制环境变量配置
copy .env.example .env

# 编辑配置文件
notepad .env
```

### 2. 数据库配置

```bash
# 确保 MySQL 服务运行
# 创建数据库（手动）
mysql -u root -p -e "CREATE DATABASE oauth2_mock CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 导入数据库结构
mysql -u root -p oauth2_mock < database/schema.sql
```

### 3. 开发模式启动

```bash
# 启动开发服务器
npm run dev

# 或使用 PM2
npm run pm2:start

# 查看日志
npm run logs

# 停止服务
npm run pm2:stop
```

### 4. 生产模式部署

```bash
# 构建前端应用
npm run build:client

# 启动生产服务器
npm start

# Docker部署
docker-compose -f ../docker-compose.yml up -d
```

## 📊 API 接口文档

### OAuth2 模拟端点

#### 1. 授权码端点
```
GET /accounts.google.com/oauth2/auth

参数:
- response_type: "code" (必需)
- client_id: string (必需)
- redirect_uri: string (必需)
- scope: string (必需)
- state: string (可选)
```

#### 2. 令牌交换端点
```
POST /accounts.google.com/oauth2/token

Content-Type: application/x-www-form-urlencoded

参数:
- grant_type:
  - "authorization_code" (授权码交换)
  - "client_credentials" (客户端凭证)
  - "urn:ietf:params:oauth:grant-type:jwt-bearer" (JWT断言)
  - "refresh_token" (刷新令牌)
- client_id: string (grant_type=client_credentials时必需)
- client_secret: string (grant_type=client_credentials时必需)
- code: string (grant_type=authorization_code时必需)
- refresh_token: string (grant_type=refresh_token时必需)
- assertion: string (grant_type=jwt-bearer时必需)
```

#### 3. 证书端点
```
GET /accounts.google.com/oauth2/v1/certs

返回: Google OAuth2证书格式
```

#### 4. 服务账号证书端点
```
GET /accounts.google.com/robot/v1/metadata/x509/{service-account}

返回: X.509证书
```

### 管理界面API

#### 1. 客户端管理
```
GET    /api/admin/clients           # 获取客户端列表
POST   /api/admin/clients           # 创建客户端
GET    /api/admin/clients/:id       # 获取客户端详情
PUT    /api/admin/clients/:id       # 更新客户端
DELETE /api/admin/clients/:id       # 删除客户端
```

#### 2. 服务账号管理
```
GET    /api/admin/server-accounts               # 获取服务账号列表
POST   /api/admin/server-accounts               # 创建服务账号
GET    /api/admin/server-accounts/:id           # 获取服务账号详情
PUT    /api/admin/server-accounts/:id           # 更新服务账号
DELETE /api/admin/server-accounts/:id           # 删除服务账号
```

#### 3. 令牌管理
```
GET    /api/admin/tokens            # 获取令牌列表
GET    /api/admin/tokens/:token     # 获取令牌详情
DELETE /api/admin/tokens/:token     # 撤销令牌
POST   /api/admin/tokens/cleanup    # 清理过期令牌
```

#### 4. 统计监控
```
GET    /api/admin/stats             # 获取统计信息
GET    /api/admin/logs              # 获取日志记录
GET    /api/admin/health            # 健康检查
GET    /api/admin/metrics           # 性能指标
```

### 健康检查端点
```
GET /health                         # 服务健康状态
GET /admin/health                   # 管理界面健康状态
```

## 🔧 配置说明

### 环境变量

```env
# 服务配置
NODE_ENV=development
PORT=8889
LOG_LEVEL=debug

# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=oauth2_mock
DB_USER=root
DB_PASSWORD=your_password
DB_CHARSET=utf8mb4
DB_TIMEZONE=+08:00

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=123456
REDIS_DB=0

# JWT配置
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=24h

# OAuth2模拟配置
OAUTH2_ACCESS_TOKEN_EXPIRES=3600
OAUTH2_REFRESH_TOKEN_EXPIRES=86400
OAUTH2_CODE_EXPIRES=600
OAUTH2_ISSUER=http://localhost:8889
OAUTH2_AUDIENCE=api.yourdomain.com

# 缓存配置
CACHE_TTL_ACCESS_TOKEN=3600
CACHE_TTL_REFRESH_TOKEN=86400
CACHE_TTL_CLIENT_TOKEN=1800
CACHE_CLEANUP_INTERVAL=300

# 安全配置
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX_REQUESTS=1000

# API配置
API_PREFIX=/api
ADMIN_PATH=/admin
```

### Docker配置

```yaml
# docker-compose.yml 中相关配置
api-proxy-nodejs:
  build:
    context: ./nodejs
    dockerfile: Dockerfile
  environment:
    - NODE_ENV=production
    - PORT=8889
    - DB_HOST=api-proxy-mysql
    - REDIS_HOST=api-proxy-redis
```

## 🏗️ 系统设计

### 数据库设计

#### 核心表结构

1. **clients** - 客户端信息
2. **server_accounts** - 服务账号信息
3. **token_mappings** - 令牌映射关系
4. **oauth_logs** - OAuth2认证日志
5. **api_usage_stats** - API使用统计

### 缓存策略

#### 三层缓存架构
```
1. 内存缓存 (Express内存) - ~1ms
2. Redis缓存 - ~5-10ms
3. MySQL数据库 - ~50-100ms
```

#### 缓存键设计
- `token_map:{access_token}` - 访问令牌映射
- `client:{client_token}:current` - 客户端当前令牌
- `oauth2:{grant_type}:stats` - OAuth2统计
- `config:{config_key}` - 配置缓存

### 认证流程

#### 1. 客户端凭证认证
```
客户端请求 → 验证client_id/client_secret → 生成access_token → 返回响应
```

#### 2. JWT断言认证
```
客户端JWT → 验证签名和内容 → 查找服务账号 → 生成access_token → 返回响应
```

#### 3. 令牌刷新
```
刷新请求 → 验证refresh_token → 查找映射关系 → 生成新access_token → 返回响应
```

## 🔐 安全特性

### 认证安全
- JWT签名验证 (RS256算法)
- 令牌过期检查
- 刷新令牌机制
- 撤销令牌支持

### 访问控制
- 速率限制
- IP白名单
- CORS配置
- 头部安全

### 数据安全
- 密码哈希存储
- 敏感数据加密
- SQL注入防护
- XSS防护

## 📈 性能优化

### 数据库优化
- 索引优化
- 连接池管理
- 查询缓存
- 读写分离

### 缓存优化
- Redis集群
- 内存缓存
- 缓存预热
- 缓存失效策略

### 应用优化
- 异步I/O
- 连接复用
- 负载均衡
- 压缩传输

## 🔍 监控和日志

### 日志系统
- 分级日志 (error/warn/info/debug)
- 结构化日志 (JSON格式)
- 日志轮转
- 远程日志传输

### 监控指标
- 响应时间
- 错误率
- 吞吐量
- 资源使用

### 健康检查
- 服务可用性
- 数据库连接
- 缓存状态
- 外部依赖

## 🧪 测试

### 单元测试
```bash
npm run test:unit
```

### 集成测试
```bash
npm run test:integration
```

### 性能测试
```bash
npm run test:performance
```

### API测试
```bash
# 测试OAuth2认证
curl -X POST http://localhost:8889/accounts.google.com/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=test&client_secret=test"

# 测试健康检查
curl http://localhost:8889/health
```

## 🚀 部署指南

### 本地部署
```bash
# 1. 安装依赖
npm install

# 2. 配置环境
copy .env.example .env

# 3. 初始化数据库
mysql -u root -p < database/schema.sql

# 4. 启动服务
npm start
```

### Docker部署
```bash
# 1. 构建镜像
docker build -t api-proxy-nodejs .

# 2. 运行容器
docker run -d --name oauth2-mock \
  -p 8889:8889 \
  -e NODE_ENV=production \
  api-proxy-nodejs

# 3. 或使用docker-compose
docker-compose -f ../docker-compose.yml up -d
```

### PM2部署
```bash
# 1. 安装PM2
npm install -g pm2

# 2. 启动服务
pm2 start pm2.config.js

# 3. 保存配置
pm2 save

# 4. 设置开机自启
pm2 startup
```

## 📝 开发指南

### 代码规范
- ESLint 代码检查
- Prettier 代码格式化
- Git Hooks 提交检查
- 类型注释 (JSDoc)

### 调试指南
```bash
# 启动调试模式
DEBUG=* npm run dev

# 查看详细日志
LOG_LEVEL=debug npm start
```

### 添加新功能
1. 创建功能分支
2. 添加测试用例
3. 实现功能代码
4. 更新文档
5. 提交代码
6. 创建Pull Request

## 🔄 与现有系统集成

### 修改OpenResty配置
在 `nginx/conf.d/gemini-proxy.conf` 中添加：

```nginx
# OAuth2 模拟服务路由
location /accounts.google.com/oauth2/token {
    proxy_pass http://api-proxy-nodejs:8889/accounts.google.com/oauth2/token;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location /accounts.google.com/oauth2/v1/certs {
    proxy_pass http://api-proxy-nodejs:8889/accounts.google.com/oauth2/v1/certs;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

### 配置同步
```bash
# 从现有配置同步客户端信息
node scripts/sync-clients.js

# 生成初始服务账号
node scripts/generate-service-accounts.js
```

### 令牌映射集成
Lua脚本中调用本地OAuth2服务：

```lua
-- 向本地OAuth2服务请求认证
local res = ngx.location.capture("/accounts.google.com/oauth2/token", {
    method = ngx.HTTP_POST,
    body = "grant_type=client_credentials&client_id=" .. client_id .. "&client_secret=" .. client_secret,
    headers = {
        ["Content-Type"] = "application/x-www-form-urlencoded"
    }
})

-- 解析响应获取access_token
if res.status == 200 then
    local token_data = cjson.decode(res.body)
    local google_access_token = token_data.access_token
    -- 建立映射关系并缓存
    token_cache:set("token_map:" .. google_access_token, client_token, token_data.expires_in)
end
```

## 📊 故障排除

### 常见问题

#### 1. 服务启动失败
```bash
# 检查端口占用
netstat -an | grep 8889

# 检查环境变量
cat .env

# 查看详细日志
npm run logs
```

#### 2. 数据库连接失败
```bash
# 检查MySQL服务
systemctl status mysql

# 测试连接
mysql -u root -p -h localhost

# 检查数据库结构
mysql -u root -p oauth2_mock -e "SHOW TABLES;"
```

#### 3. Redis连接失败
```bash
# 检查Redis服务
systemctl status redis

# 测试连接
redis-cli -h localhost -p 6379 ping

# 查看Redis配置
redis-cli -h localhost config get "*"
```

#### 4. OAuth2认证失败
```bash
# 检查服务账号
mysql -u root -p oauth2_mock -e "SELECT * FROM server_accounts;"

# 检查客户端配置
mysql -u root -p oauth2_mock -e "SELECT * FROM clients;"

# 查看认证日志
tail -f logs/oauth2/oauth2.log
```

### 性能问题
```bash
# 检查数据库性能
mysql -u root -p oauth2_mock -e "SHOW PROCESSLIST;"

# 检查缓存命中率
redis-cli -h localhost info stats

# 查看内存使用
free -h

# 监控网络
iftop -i eth0
```

## 📞 技术支持

### 问题报告
1. 检查文档中的故障排除部分
2. 查看系统日志文件
3. 收集相关错误信息
4. 记录复现步骤
5. 提供环境配置

### 开发者信息
- **项目名称**: OAuth2 Mock Service
- **版本**: 1.0.0
- **技术栈**: Node.js + Express + MySQL + Redis
- **依赖管理**: npm
- **进程管理**: PM2
- **容器化**: Docker

---

**注意**: 本系统仅用于开发和测试环境，不应在生产环境中使用。在生产环境中请使用真实的Google OAuth2服务。