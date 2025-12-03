# Node.js路径调整指南

## 📁 当前Volume映射结构

根据`nodejs/docker-compose.yml`，当前的Volume映射如下：

```yaml
# Node.js服务Volume映射
volumes:
  - ./logs:/app/logs                              # 应用日志
  - ./tmp:/app/tmp                               # 临时文件
  - ../data/client:/app/client                   # 服务账号文件（可读写）

# 其他服务Volume映射
  - ./mysql-data:/var/lib/mysql                 # MySQL数据
  - ./database:/docker-entrypoint-initdb.d:ro   # 数据库初始化脚本
  - ./redis-data:/data                          # Redis数据
```

## 🎯 需要调整的路径

### 1. 日志路径调整

**当前代码**：
```javascript
// LoggerService.js:14
const logDir = process.env.LOG_DIR || '../logs/oauth2';
```

**问题**：路径指向了`../logs/oauth2`，但Volume映射的是`./logs:/app/logs`

**调整后**：
```javascript
// 应该直接使用/app/logs
const logDir = process.env.LOG_DIR || '/app/logs';
```

### 2. 临时文件路径

需要检查是否有代码使用了临时文件目录，如果有也需要调整。

### 3. 服务账号文件路径

**当前Volume映射**：
```yaml
- ../data/client:/app/client
```

这意味着：
- 宿主机路径：`../data/client/google_server_account/`
- 容器内路径：`/app/client/google_server_account/`

## ✅ 代码调整方案

### 1. 修复LoggerService.js

```javascript
// 修改前
const logDir = process.env.LOG_DIR || '../logs/oauth2';

// 修改后
const logDir = process.env.LOG_DIR || '/app/logs';
```

### 2. 检查服务账号文件读取

需要检查是否有代码直接读取服务账号JSON文件，确保路径正确。

### 3. 添加环境变量支持

在docker-compose.yml中添加相关环境变量：

```yaml
environment:
  - LOG_DIR=/app/logs
  - TMP_DIR=/app/tmp
  - CLIENT_DIR=/app/client
```

## 🔧 具体调整步骤

### 步骤1：更新LoggerService.js

```javascript
// nodejs/server/services/LoggerService.js
const logDir = process.env.LOG_DIR || '/app/logs';
```

### 步骤2：更新docker-compose.yml环境变量

```yaml
environment:
  # ... 其他环境变量

  # 目录路径配置
  - LOG_DIR=/app/logs
  - TMP_DIR=/app/tmp
  - CLIENT_DIR=/app/client
```

### 步骤3：创建必要的目录

确保容器内目录存在：

```dockerfile
# Dockerfile
RUN mkdir -p /app/logs /app/tmp /app/client
```

## 📋 验证清单

- [ ] LoggerService.js使用正确的日志路径
- [ ] 服务账号文件读取路径正确
- [ ] 临时文件使用正确路径
- [ ] 环境变量配置正确
- [ ] 容器内目录权限正确
- [ ] 日志文件正常写入
- [ ] 服务账号文件可读写访问

## 🚀 部署影响

### 无数据影响
- 只是路径调整，不影响现有数据
- 日志会写入新的位置，旧日志仍然保留

### 需要重启服务
- 代码更新后需要重启容器
- Volume映射更新后需要重新创建容器

## 📊 目录对应关系

| 宿主机路径 | 容器内路径 | 用途 |
|-----------|------------|------|
| `./logs` | `/app/logs` | 应用日志 |
| `./tmp` | `/app/tmp` | 临时文件 |
| `../data/client` | `/app/client` | 服务账号文件 |
| `./mysql-data` | `/var/lib/mysql` | MySQL数据 |
| `./redis-data` | `/data` | Redis数据 |
| `./database` | `/docker-entrypoint-initdb.d` | 数据库初始化 |

---

**总结**: 主要需要调整LoggerService.js中的日志路径，确保与Volume映射一致。