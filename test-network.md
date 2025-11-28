# Docker Compose 网络访问测试

## 测试场景

假设有以下配置：

```yaml
services:
  nginx:
    container_name: nginx-web
    depends_on:
      - redis

  redis:
    container_name: redis-cache
    image: redis:alpine
```

## 网络访问方式测试

### 在 nginx 容器内测试：

```bash
# 方法1：使用服务名
docker exec nginx-web ping redis
# ✅ 应该可以ping通

# 方法2：使用容器名
docker exec nginx-web ping redis-cache
# ✅ 也应该可以ping通

# 方法3：查看网络解析
docker exec nginx-web nslookup redis
# docker exec nginx-web nslookup redis-cache
```

## 实际测试命令

```bash
# 启动测试容器
docker-compose up -d

# 进入nginx容器测试网络
docker-compose exec nginx sh

# 在容器内测试
ping redis
ping redis-cache
nslookup redis
nslookup redis-cache
```

## 结论

Docker Compose会为每个服务创建多个网络别名：
1. 服务名（默认别名）
2. 容器名（如果有container_name）
3. 项目名_服务名_1（传统格式）

所以实际上两种方式都可以！