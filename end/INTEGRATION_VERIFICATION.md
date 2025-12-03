# 系统集成验证指南

## 🎯 验证目标

确保OAuth2模拟服务与现有的OpenResty AI代理系统完全集成，包括：
- Docker网络连通性
- 服务依赖关系
- API代理路由
- 数据库和缓存连接
- Token映射功能

## 📋 验证清单

### 1. Docker配置验证

#### ✅ 主项目配置 (`docker-compose.yml`)
```yaml
services:
  api-proxy-nginx:
    # ✅ 正确的网络配置
    networks:
      - api-proxy-network
    # ✅ 正确的依赖关系
    depends_on:
      - api-proxy-nodejs

networks:
  api-proxy-network:
    external: true
```

#### ✅ Node.js项目配置 (`nodejs/docker-compose.yml`)
```yaml
services:
  api-proxy-nodejs:
    networks:
      api-proxy-network:
        driver: bridge
        name: api-proxy-network  # ✅ 创建网络

  api-proxy-mysql:
    networks:
      - api-proxy-network  # ✅ 加入网络

  api-proxy-redis:
    networks:
      - api-proxy-network  # ✅ 加入网络
```

### 2. 文件路径验证

#### ✅ Volume映射检查
```yaml
# Node.js服务
volumes:
  - ../logs:/app/logs
  - ../client/google_server_account:/app/client/google_server_account:ro
  - ../tmp/oauth2:/app/tmp

# MySQL服务
volumes:
  - ../mysql-data:/var/lib/mysql
  - ../database:/docker-entrypoint-initdb.d:ro

# Redis服务
volumes:
  - ../redis-data:/data
```

#### ✅ 目录结构
```
D:\www\nginxzhuanfa\end\
├── mysql-data\                 # ✅ MySQL数据目录
├── redis-data\                 # ✅ Redis数据目录
├── logs\oauth2\               # ✅ OAuth2日志目录
├── tmp\oauth2\                # ✅ 临时文件目录
├── client\google_server_account\ # ✅ 服务账号目录
└── nodejs\
    ├── server\                # ✅ Node.js应用代码
    ├── Dockerfile            # ✅ Docker镜像配置
    ├── docker-compose.yml    # ✅ 服务编排
    └── package.json          # ✅ 依赖配置
```

### 3. 网络架构验证

#### ✅ 网络创建顺序
1. **Node.js服务先启动** → 创建 `api-proxy-network`
2. **OpenResty服务后启动** → 连接外部网络

#### ✅ 容器间通信
```
api-proxy-nginx (8888) → api-proxy-nodejs:8889
api-proxy-nodejs → api-proxy-mysql:3306
api-proxy-nodejs → api-proxy-redis:6379
```

### 4. OpenResty配置验证

#### ✅ OAuth2代理路由 (`nginx/conf.d/gemini-proxy.conf`)
```nginx
# OAuth2授权端点
location /accounts.google.com/o/oauth2/auth {
    proxy_pass http://api-proxy-nodejs:8889/accounts.google.com/o/oauth2/auth;
    # ✅ CORS支持
}

# OAuth2令牌端点
location /oauth2.googleapis.com/token {
    proxy_pass http://api-proxy-nodejs:8889/accounts.google.com/oauth2/token;
    # ✅ CORS支持
}

# OAuth2证书端点
location /www.googleapis.com/oauth2/v1/certs {
    proxy_pass http://api-proxy-nodejs:8889/accounts.google.com/oauth2/v1/certs;
    # ✅ 缓存配置
}

# 服务账号证书端点
location ~ ^/www.googleapis.com/robot/v1/metadata/x509/(.*)$ {
    proxy_pass http://api-proxy-nodejs:8889/accounts.google.com/robot/v1/metadata/x509/$1;
    # ✅ 缓存配置
}
```

### 5. 数据库验证

#### ✅ 数据库初始化
- **数据库**: `oauth2_mock`
- **用户**: `oauth2_user`
- **密码**: `oauth2_password_123456`
- **初始化脚本**: `database/schema.sql`

#### ✅ 关键表结构
```sql
-- Token映射表（核心功能）
CREATE TABLE token_mappings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    client_token VARCHAR(255) NOT NULL,
    google_access_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    cache_version BIGINT DEFAULT 1,
    status ENUM('active', 'revoked', 'expired') DEFAULT 'active'
);

-- 服务账号表
CREATE TABLE service_accounts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    client_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    private_key TEXT NOT NULL,
    project_id VARCHAR(255) NOT NULL
);
```

### 6. 缓存系统验证

#### ✅ Redis配置
```yaml
environment:
  - REDIS_HOST=api-proxy-redis
  - REDIS_PORT=6379
  - REDIS_PASSWORD=123456
  - REDIS_DB=0
```

#### ✅ 缓存策略
- **多层缓存**: 内存 + Redis + 数据库
- **TTL配置**:
  - Access Token: 3600秒
  - Refresh Token: 86400秒
  - Client Token: 1800秒

### 7. API端点验证

#### ✅ OAuth2模拟端点
```
POST /accounts.google.com/oauth2/token
  - grant_type=client_credentials
  - grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
  - grant_type=authorization_code
  - grant_type=refresh_token

GET  /accounts.google.com/oauth2/v1/certs
GET  /www.googleapis.com/robot/v1/metadata/x509/{email}

GET  /health           # 健康检查
GET  /status           # 服务状态
```

#### ✅ 管理端点
```
GET  /admin           # Web管理界面
GET  /api/tokens      # Token管理API
POST /api/tokens      # 创建Token映射
DELETE /api/tokens/:id # 删除Token映射
```

### 8. 环境变量验证

#### ✅ OpenResty环境变量
```yaml
environment:
  # OAuth2服务连接
  - OAUTH2_SERVICE_HOST=api-proxy-nodejs
  - OAUTH2_SERVICE_PORT=8889

  # Redis连接
  - REDIS_HOST=api-proxy-redis
  - REDIS_PORT=6379
  - REDIS_PASSWORD=123456
```

#### ✅ Node.js环境变量
```yaml
environment:
  # 数据库连接
  - DB_HOST=api-proxy-mysql
  - DB_PORT=3306
  - DB_NAME=oauth2_mock
  - DB_USER=oauth2_user
  - DB_PASSWORD=oauth2_password_123456

  # Redis连接
  - REDIS_HOST=api-proxy-redis
  - REDIS_PORT=6379
  - REDIS_PASSWORD=123456

  # JWT配置
  - JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
  - JWT_ALGORITHM=RS256
```

## 🧪 功能测试场景

### 场景1: OAuth2客户端凭证流程
```bash
# 1. 请求Access Token
curl -X POST http://localhost:8888/oauth2.googleapis.com/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=test&client_secret=test"

# 2. 验证返回的token格式
{
  "access_token": "ya29.a0AfH6SMC...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### 场景2: JWT Bearer流程
```bash
# 1. 使用服务账号JWT换取Access Token
curl -X POST http://localhost:8888/oauth2.googleapis.com/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<JWT>"

# 2. 验证Token映射关系
# 检查数据库token_mappings表
```

### 场景3: 证书获取
```bash
# 1. 获取OAuth2证书
curl http://localhost:8888/www.googleapis.com/oauth2/v1/certs

# 2. 获取服务账号证书
curl http://localhost:8888/www.googleapis.com/robot/v1/metadata/x509/test@example.iam.gserviceaccount.com
```

### 场景4: 健康检查
```bash
# 1. 检查Node.js服务
curl http://localhost:8889/health

# 2. 检查OpenResty服务
curl http://localhost:8888/health

# 3. 检查服务状态
curl http://localhost:8889/status
```

## 🔧 故障排除

### 常见问题1: 网络连接失败
**症状**: OpenResty无法连接到Node.js服务
**解决**:
```bash
# 检查网络是否存在
docker network ls | grep api-proxy-network

# 检查容器网络连接
docker network inspect api-proxy-network

# 重建网络
docker-compose down
docker network rm api-proxy-network
docker-compose up -d
```

### 常见问题2: 数据库连接失败
**症状**: Node.js服务无法连接到MySQL
**解决**:
```bash
# 检查MySQL容器状态
docker-compose logs api-proxy-mysql

# 检查数据库是否初始化
docker-compose exec api-proxy-mysql mysql -u oauth2_user -p oauth2_password_123456 oauth2_mock -e "SHOW TABLES;"

# 手动初始化数据库
docker-compose exec api-proxy-mysql mysql -u root -p root_password_123456 -e "SOURCE /docker-entrypoint-initdb.d/schema.sql;"
```

### 常见问题3: Redis连接失败
**症状**: Token缓存不工作
**解决**:
```bash
# 检查Redis容器状态
docker-compose logs api-proxy-redis

# 测试Redis连接
docker-compose exec api-proxy-redis redis-cli -a 123456 ping
```

### 常见问题4: 构建失败
**症状**: Docker镜像构建失败
**解决**:
```bash
# 清理构建缓存
docker builder prune -f

# 重新构建
docker-compose build --no-cache

# 查看构建日志
docker-compose build --no-cache --progress=plain
```

## 📊 监控指标

### 容器健康检查
- **api-proxy-nginx**: 每30秒检查 `http://localhost:8080/health`
- **api-proxy-nodejs**: 每30秒检查 `http://localhost:8889/health`
- **api-proxy-mysql**: 每30秒检查数据库连接
- **api-proxy-redis**: 每30秒检查Redis连接

### 日志监控
```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f api-proxy-nodejs
docker-compose logs -f api-proxy-nginx
```

### 资源监控
```bash
# 查看资源使用情况
docker stats

# 查看磁盘使用
df -h
du -sh mysql-data redis-data logs/
```

## ✅ 验证完成标准

系统集成验证通过的标准：

1. **所有容器正常运行** ✅
2. **网络连接正常** ✅
3. **数据库初始化完成** ✅
4. **Redis缓存可用** ✅
4. **OAuth2端点响应正确** ✅
5. **Token映射功能正常** ✅
6. **健康检查通过** ✅
7. **日志记录正常** ✅

---

**注意**: 按照此验证指南逐步检查所有配置，确保系统完全集成并正常工作。