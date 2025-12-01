# API Proxy 部署文档总览

## 📚 文档索引

本项目包含以下部署相关文档：

### 1. **SERVER_DEPLOYMENT.md** ⭐ 推荐首先阅读
   - **用途**: 服务器快速部署指南
   - **内容**: 三步完成部署的简化流程
   - **适合**: 快速部署和日常维护

### 0. **DOCKER_COMPOSE_V2_UPDATE.md** ℹ️ 重要更新
   - **用途**: Docker Compose V2 更新说明
   - **内容**: V1 到 V2 的变更、安装方法、验证步骤
   - **适合**: 了解 Docker Compose V2 的变化

### 2. **PRE_DEPLOYMENT_CHECKLIST.md**
   - **用途**: 部署前检查清单
   - **内容**: 上传前验证、环境检查、部署步骤
   - **适合**: 首次部署前的完整检查

### 3. **DEPLOYMENT_GUIDE.md**
   - **用途**: 详细部署指南
   - **内容**: 完整的部署流程、故障排查、性能优化
   - **适合**: 深入了解和高级配置

### 4. **data/map/README-NEW-CONFIG.md**
   - **用途**: 新配置结构说明
   - **内容**: map-config.json 的详细说明
   - **适合**: 配置文件的编写和修改

### 5. **TESTING_CHECKLIST.md**
   - **用途**: 测试检查清单
   - **内容**: 单元测试、集成测试、功能测试
   - **适合**: 验证功能和故障排查

## 🚀 快速开始

### 查看帮助信息

```bash
# 直接运行脚本（无参数）会显示详细的使用说明
./deploy.sh

# 或使用 help 命令
./deploy.sh help
./deploy.sh --help
./deploy.sh -h
```

### 最简部署流程（3 步）

```bash
# 1. 上传并解压
scp end.tar.gz user@server:/home/user/
ssh user@server
cd /home/user && tar -xzf end.tar.gz && cd end

# 2. 检查环境
chmod +x deploy.sh && ./deploy.sh check

# 3. 启动服务
./deploy.sh start
```

### 验证部署

```bash
# 运行测试
./deploy.sh test

# 查看状态
./deploy.sh status

# 查看日志
./deploy.sh logs
```

## 📦 项目结构

```
end/
├── Dockerfile.new                    # 新的 Dockerfile（基于 openresty:alpine-fat）
├── docker compose.new.yml            # 新的 docker compose 配置
├── deploy.sh                         # 一键部署脚本 ⭐
│
├── nginx/                            # Nginx 配置
│   ├── nginx.conf                    # 主配置
│   └── conf.d/
│       └── gemini-proxy.conf         # 代理配置
│
├── lua/                              # Lua 脚本
│   ├── config.lua                    # 配置管理
│   ├── utils.lua                     # 工具函数
│   ├── auth_manager.lua              # OAuth2 认证
│   └── stream_handler.lua            # 流式处理
│
├── data/                             # 数据目录
│   ├── map/
│   │   ├── map-config.json           # 统一配置文件 ⭐
│   │   └── README-NEW-CONFIG.md      # 配置说明
│   ├── json/                         # 服务账号凭证
│   │   └── *.json
│   └── jwt/                          # Token 缓存（自动创建）
│
├── config/                           # 应用配置
│   └── app_config.json
│
├── logs/                             # 日志目录（自动创建）
├── redis-data/                       # Redis 数据（自动创建）
│
└── 文档/
    ├── SERVER_DEPLOYMENT.md          # 快速部署指南 ⭐
    ├── PRE_DEPLOYMENT_CHECKLIST.md   # 部署前检查
    ├── DEPLOYMENT_GUIDE.md           # 详细部署指南
    └── TESTING_CHECKLIST.md          # 测试清单
```

## 🔧 技术栈

### 核心组件

- **OpenResty**: 基于 Nginx 的 Web 平台
  - 镜像: `openresty/openresty:alpine-fat`
  - 包含: Nginx + LuaJIT + 常用 Lua 模块

- **Lua 模块**:
  - `lua-cjson`: JSON 处理（内置）
  - `lua-resty-http`: HTTP 客户端（需安装）

- **Redis**: 缓存和会话存储
  - 镜像: `redis:7-alpine`

### 架构特点

1. **Lazy Loading**: Token 按需获取
2. **多服务支持**: 通过前缀识别（gemini-, claude-）
3. **权重负载均衡**: 多服务账号权重分配
4. **三级缓存**: 内存 → 文件 → OAuth2 API

## 📋 部署要求

### 服务器要求

- **操作系统**: Linux (Ubuntu 20.04+ / CentOS 7+)
- **Docker**: 20.10+
- **Docker Compose**: 1.29+
- **内存**: 2GB+
- **磁盘**: 10GB+
- **网络**: 能访问 Google OAuth2 API

### 必需文件

- ✅ `data/map/map-config.json` - 统一配置
- ✅ `data/json/*.json` - 至少一个服务账号文件
- ✅ `nginx/nginx.conf` - Nginx 配置
- ✅ `nginx/conf.d/gemini-proxy.conf` - 代理配置
- ✅ `lua/*.lua` - Lua 脚本

## 🎯 核心功能

### 1. 统一配置管理

使用 `map-config.json` 统一管理：
- 客户端配置
- 服务账号映射
- 模型域名配置

### 2. 智能路由

根据 `client_token` 前缀自动识别服务类型：
- `gemini-*` → Gemini 服务
- `claude-*` → Claude 服务

### 3. Lazy Loading

Token 按需获取，避免启动失败：
- 检查内存缓存
- 检查文件缓存
- 按需调用 OAuth2 API

### 4. 负载均衡

支持多服务账号权重分配：
```json
"key_filename_gemini": [
  {"key_filename": "account1.json", "key_weight": 2},
  {"key_filename": "account2.json", "key_weight": 1}
]
```

## 🔍 常用命令速查

```bash
# 部署相关
./deploy.sh check      # 检查环境
./deploy.sh build      # 构建镜像
./deploy.sh start      # 启动服务
./deploy.sh stop       # 停止服务
./deploy.sh restart    # 重启服务

# 监控相关
./deploy.sh status     # 查看状态
./deploy.sh logs       # 查看日志
./deploy.sh test       # 运行测试

# Docker 命令
docker compose ps                    # 查看容器
docker compose logs -f               # 查看日志
docker compose exec api-proxy-nginx sh  # 进入容器

# 测试命令
curl http://localhost:8888/health    # 健康检查
curl http://localhost:8888/status    # 状态检查
```

## 📞 获取帮助

### 查看文档

```bash
# 快速部署
cat SERVER_DEPLOYMENT.md

# 部署前检查
cat PRE_DEPLOYMENT_CHECKLIST.md

# 详细指南
cat DEPLOYMENT_GUIDE.md

# 配置说明
cat data/map/README-NEW-CONFIG.md
```

### 查看日志

```bash
# 实时日志
./deploy.sh logs

# 错误日志
docker compose logs api-proxy-nginx | grep -i error

# 配置加载日志
docker compose logs api-proxy-nginx | grep Configuration

# OAuth2 日志
docker compose logs api-proxy-nginx | grep oauth
```

### 运行测试

```bash
# 自动测试
./deploy.sh test

# 手动测试
curl http://localhost:8888/health
curl http://localhost:8888/status
```

## 🐛 故障排查

### 快速诊断

```bash
# 1. 检查容器状态
docker compose ps

# 2. 查看最近日志
docker compose logs --tail=50 api-proxy-nginx

# 3. 测试健康检查
curl http://localhost:8888/health

# 4. 检查配置加载
curl http://localhost:8888/status
```

### 常见问题

| 问题 | 检查命令 | 解决方案 |
|------|---------|---------|
| 容器无法启动 | `docker compose logs` | 查看错误日志 |
| 端口被占用 | `netstat -tlnp \| grep 8888` | 修改端口或停止占用进程 |
| 配置加载失败 | `cat data/map/map-config.json \| jq .` | 验证 JSON 格式 |
| Token 获取失败 | `docker compose logs \| grep oauth` | 检查服务账号和网络 |

详细故障排查请参考 `DEPLOYMENT_GUIDE.md`

## 🔐 安全建议

1. **限制端口访问**
   ```bash
   sudo ufw allow from 192.168.1.0/24 to any port 8888
   ```

2. **保护敏感文件**
   ```bash
   chmod 600 data/json/*.json
   chmod 600 data/map/map-config.json
   ```

3. **定期备份**
   ```bash
   tar -czf backup-$(date +%Y%m%d).tar.gz data/ config/
   ```

4. **使用 HTTPS**（生产环境）
   - 配置 SSL 证书
   - 启用 HTTPS 端口

## 📈 性能优化

1. **调整 Worker 进程**: `worker_processes auto;`
2. **增加缓存大小**: `lua_shared_dict token_cache 50m;`
3. **启用日志轮转**: 配置 logrotate
4. **监控资源使用**: `docker stats`

详细优化请参考 `DEPLOYMENT_GUIDE.md`

## 🎉 部署成功标志

✅ 容器状态为 `Up (healthy)`
✅ 健康检查返回 `{"status":"ok"}`
✅ 状态检查显示 `"config_loaded":true`
✅ 日志显示 `Configuration loaded successfully`
✅ API 请求能够正常转发

## 📝 更新日志

### 2024-12-01
- ✨ 创建基于 `openresty:alpine-fat` 的新 Dockerfile
- ✨ 创建新的 docker compose.yml 配置
- ✨ 添加一键部署脚本 `deploy.sh`
- ✨ 完善部署文档和检查清单
- ✨ 实现 Lazy Loading Token 获取机制
- ✨ 支持多服务类型和权重负载均衡

---

**准备好了吗？开始部署吧！**

👉 **下一步**: 阅读 `SERVER_DEPLOYMENT.md` 开始部署
