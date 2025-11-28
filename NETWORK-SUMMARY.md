# 🌐 网络配置总结

## 服务名统一配置

我们已将所有服务的**服务名**和**容器名**统一，避免混淆：

### 📋 服务映射表

| 功能 | 原服务名 | 新统一名 | 容器名 | 网络别名 |
|------|------------|-----------|----------|------------|
| Nginx代理 | `nginx` | `api-proxy-nginx` | `api-proxy-nginx` |
| Redis缓存 | `redis` | `api-proxy-redis` | `api-proxy-redis` |
| 日志收集 | `fluentd` | `api-proxy-fluent` | `api-proxy-fluent` |

### 🔗 网络访问配置

#### 在Nginx容器内访问Redis：
```bash
# 使用统一的服务名（推荐）
host: api-proxy-redis
port: 6379

# 环境变量配置
REDIS_HOST=api-proxy-redis
REDIS_PORT=6379
```

#### 在宿主机访问服务：
```bash
# Nginx代理服务
curl http://localhost:8080
curl https://localhost:8443

# Redis服务
redis-cli -h localhost -p 6379
```

#### 容器管理命令：
```bash
# 进入Nginx容器
docker-compose exec api-proxy-nginx bash

# 进入Redis容器
docker-compose exec api-proxy-redis redis-cli

# 查看日志
docker-compose logs -f api-proxy-nginx
docker-compose logs -f api-proxy-redis
```

### 🐳 Docker Compose 网络结构

```yaml
networks:
  api-proxy-network:          # 统一的网络名称
    driver: bridge

services:
  api-proxy-nginx:           # 服务名 = 网络主机名
    container_name: api-proxy-nginx
    networks:
      - api-proxy-network    # 连接到统一网络

  api-proxy-redis:           # 服务名 = 网络主机名
    container_name: api-proxy-redis
    networks:
      - api-proxy-network    # 连接到统一网络

  api-proxy-fluent:          # 服务名 = 网络主机名
    container_name: api-proxy-fluent
    networks:
      - api-proxy-network    # 连接到统一网络
```

### ✅ 配置验证

#### 1. 网络连通性测试：
```bash
# 启动服务
docker-compose up -d

# 进入nginx容器测试redis连接
docker-compose exec api-proxy-nginx sh

# 在nginx容器内测试
ping api-proxy-redis          # 应该成功
nc -z api-proxy-redis 6379   # 应该成功连接
```

#### 2. 服务依赖验证：
```bash
# 检查服务状态
docker-compose ps

# 检查网络
docker network ls | grep api-proxy

# 查看网络详情
docker network inspect nginxzhuanfa_api-proxy-network
```

#### 3. 环境变量验证：
```bash
# 检查nginx容器的环境变量
docker-compose exec api-proxy-nginx env | grep REDIS

# 预期输出
REDIS_HOST=api-proxy-redis
REDIS_PORT=6379
```

### 🎯 最佳实践

1. **命名规范**：
   - 使用 `api-proxy-` 前缀统一命名
   - 服务名 = 容器名 = 网络别名

2. **环境配置**：
   - 使用服务名作为网络主机名
   - 在`.env`文件中集中配置

3. **网络隔离**：
   - 所有服务连接到 `api-proxy-network`
   - 避免与默认docker网络冲突

4. **调试建议**：
   - 使用 `docker-compose exec` 进入容器调试
   - 使用 `ping` 和 `nc` 测试网络连通性

### 🔧 常用命令

```bash
# 服务管理
docker-compose up -d                    # 启动所有服务
docker-compose down                      # 停止所有服务
docker-compose restart api-proxy-nginx   # 重启nginx服务

# 网络调试
docker-compose exec api-proxy-nginx ping api-proxy-redis
docker-compose exec api-proxy-redis ping api-proxy-nginx

# 查看服务状态
docker-compose ps
docker-compose logs -f

# 进入容器
docker-compose exec api-proxy-nginx bash
docker-compose exec api-proxy-redis redis-cli
```

## 📝 迁移说明

如果你有之前的配置：

### 从旧配置迁移：
```bash
# 停止旧服务
docker-compose down

# 更新配置文件后启动
docker-compose up -d

# 验证新配置
make test
```

### 环境变量更新：
```bash
# 更新.env文件
REDIS_HOST=api-proxy-redis  # 从redis改为api-proxy-redis

# 重启服务
docker-compose down && docker-compose up -d
```

---

这样的统一配置让网络关系更清晰，管理更便捷！