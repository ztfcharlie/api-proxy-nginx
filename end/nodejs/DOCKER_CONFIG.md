# Docker 配置验证和部署指南

## ✅ 配置验证清单

### 1. Docker Compose 配置检查

#### 主项目配置 (`docker-compose.yml`)
```yaml
✅ 版本号: version: '3.8'
✅ 服务名称: api-proxy-nginx
✅ 网络配置: api-proxy-network (内部创建)
✅ 端口映射: 8888:8080, 8443:8443
✅ 依赖关系: depends_on: [api-proxy-redis]
```

#### Node.js 服务配置 (`nodejs/docker-compose.yml`)
```yaml
✅ 版本号: version: '3.8'
✅ 服务名称: api-proxy-nodejs, api-proxy-mysql, api-proxy-redis
✅ 网络配置: api-proxy-network (外部引用)
✅ 卷管理: mysql-data, redis-data (本地卷)
✅ 端口映射: 8889:8889, 3306:3306, 6379:6379
```

### 2. Volume 路径映射关系

#### 正确的映射结构
```
D:\www\nginxzhuanfa\end\
├── logs/                          # 主服务日志
│   ├── access.log
│   ├── error.log
│   └── oauth2/                    # Node.js OAuth2 日志
│       ├── oauth2.log
│       ├── access.log
│       └── error.log
│
├── mysql-data/                    # MySQL 数据存储
│   ├── mysql/
│   ├── performance_schema/
│   └── oauth2_mock/
│
├── redis-data/                    # Redis 数据存储
│   ├── dump.rdb
│   └── appendonly.aof
│
├── tmp/oauth2/                    # OAuth2 临时文件
│   ├── uploads/
│   └── cache/
│
└── client/google_server_account/  # 服务账号文件
    ├── service-account-1.json
    └── service-account-2.json
```

### 3. 容器内路径对应关系

#### Node.js 容器 (`/app`)
```yaml
volumes:
  ./logs:/app/logs                          # ✅ 正确
  ../client/google_server_account:/app/client/google_server_account:ro  # ✅ 正确
  ../tmp/oauth2:/app/tmp                     # ✅ 正确
```

#### MySQL 容器 (`/var/lib/mysql`)
```yaml
volumes:
  mysql-data:/var/lib/mysql                  # ✅ 正确 (使用命名卷)
  ../database:/docker-entrypoint-initdb.d:ro # ✅ 正确
```

#### Redis 容器 (`/data`)
```yaml
volumes:
  redis-data:/data                           # ✅ 正确 (使用命名卷)
```

## 🔧 配置验证命令

### 1. 检查Docker配置语法
```bash
# 检查主项目配置
cd D:\www\nginxzhuanfa\end
docker-compose config

# 检查Node.js服务配置
cd nodejs
docker-compose config
```

### 2. 验证网络配置
```bash
# 创建网络
docker network create api-proxy-network

# 检查网络
docker network ls
docker network inspect api-proxy-network
```

### 3. 验证卷挂载
```bash
# 预创建必要目录
mkdir -p logs/oauth2 mysql-data redis-data tmp/oauth2 client/google_server_account

# 设置权限 (Linux/macOS)
chmod -R 755 logs mysql-data redis-data tmp/oauth2 client/google_server_account
```

### 4. 验证镜像构建
```bash
# 构建Node.js镜像
cd nodejs
docker build -t api-proxy-nodejs .

# 检查镜像
docker images | grep api-proxy-nodejs
```

## 🚀 部署步骤

### 1. 环境准备
```bash
# 进入项目根目录
cd D:\www\nginxzhuanfa\end

# 创建必要目录
mkdir -p logs/oauth2 mysql-data redis-data tmp/oauth2 client/google_server_account

# 创建Docker网络
docker network create api-proxy-network
```

### 2. 启动Node.js服务栈
```bash
# 启动Node.js相关服务
cd nodejs
docker-compose up -d

# 等待服务启动
sleep 30

# 检查服务状态
docker-compose ps

# 检查日志
docker-compose logs -f
```

### 3. 启动主代理服务
```bash
# 返回根目录
cd ..

# 启动OpenResty代理服务
docker-compose up -d

# 检查所有服务状态
docker-compose ps

# 检查网络连通性
docker network inspect api-proxy-network
```

### 4. 验证部署
```bash
# 健康检查
curl http://localhost:8888/health
curl http://localhost:8889/health

# 测试数据库连接
docker-compose exec api-proxy-mysql mysqladmin ping -u oauth2_user -poauth2_password_123456

# 测试Redis连接
docker-compose exec api-proxy-redis redis-cli -a 123456 ping

# 测试OAuth2服务
curl -X POST http://localhost:8889/accounts.google.com/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=test&client_secret=test"
```

## 🔍 故障排除

### 1. 网络连接问题
```bash
# 检查网络是否存在
docker network ls | grep api-proxy-network

# 重新创建网络
docker network rm api-proxy-network
docker network create api-proxy-network

# 检查容器网络连接
docker-compose exec api-proxy-nodejs ping api-proxy-mysql
docker-compose exec api-proxy-nodejs ping api-proxy-redis
```

### 2. Volume 权限问题
```bash
# 检查目录权限
ls -la logs mysql-data redis-data tmp/oauth2 client/google_server_account

# 修复权限 (Linux/macOS)
sudo chown -R $USER:$USER logs mysql-data redis-data tmp/oauth2 client/google_server_account
chmod -R 755 logs mysql-data redis-data tmp/oauth2 client/google_server_account
```

### 3. 数据库初始化问题
```bash
# 检查数据库初始化脚本
ls -la database/schema.sql

# 手动导入数据库结构
docker-compose exec api-proxy-mysql mysql -u root -proot_password_123456 oauth2_mock < database/schema.sql

# 检查数据库表
docker-compose exec api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;"
```

### 4. 服务启动失败
```bash
# 检查容器日志
docker-compose logs api-proxy-nodejs
docker-compose logs api-proxy-mysql
docker-compose logs api-proxy-redis

# 检查容器状态
docker-compose ps

# 重启服务
docker-compose restart

# 重建容器
docker-compose up -d --force-recreate
```

### 5. 端口冲突
```bash
# 检查端口占用
netstat -tulpn | grep :8889
netstat -tulpn | grep :3306
netstat -tulpn | grep :6379

# 修改端口 (在docker-compose.yml中)
ports:
  - "8890:8889"  # 修改为其他端口
```

## 📊 配置最佳实践

### 1. 环境变量管理
```bash
# 使用 .env 文件
cp .env.example .env

# 生产环境修改敏感配置
notepad .env
```

### 2. 安全配置
```yaml
# 限制端口暴露 (生产环境)
services:
  api-proxy-mysql:
    ports: []  # 不暴露到主机
  api-proxy-redis:
    ports: []  # 不暴露到主机
```

### 3. 资源限制
```yaml
# 添加资源限制
services:
  api-proxy-nodejs:
    mem_limit: 512m
    cpus: 1.0
  api-proxy-mysql:
    mem_limit: 1g
    cpus: 1.0
```

### 4. 日志管理
```yaml
# 日志轮转配置
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## ✅ 验证清单

### 部署前检查
- [ ] Docker 和 Docker Compose 已安装
- [ ] 项目目录结构正确
- [ ] 网络已创建 (api-proxy-network)
- [ ] 必要目录已创建并有正确权限
- [ ] 环境变量已配置
- [ ] 数据库初始化脚本存在

### 部署后检查
- [ ] 所有容器正常启动
- [ ] 健康检查通过
- [ ] 数据库连接正常
- [ ] Redis 连接正常
- [ ] OAuth2 服务响应正常
- [ ] 日志文件正确生成
- [ ] 网络连通性正常

### 性能检查
- [ ] 内存使用合理
- [ ] CPU 使用正常
- [ ] 磁盘空间充足
- [ ] 响应时间符合预期

## 📞 技术支持

### 常用调试命令
```bash
# 查看容器详情
docker inspect api-proxy-nodejs

# 进入容器调试
docker-compose exec api-proxy-nodejs /bin/bash

# 查看实时日志
docker-compose logs -f api-proxy-nodejs

# 监控资源使用
docker stats
```

### 重置部署
```bash
# 完全重置
docker-compose down -v
docker network rm api-proxy-network
docker network create api-proxy-network
docker-compose up -d
```

---

**注意**: 在生产环境部署前，请确保所有密码和敏感配置都已修改为安全值。