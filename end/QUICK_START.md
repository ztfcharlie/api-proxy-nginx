# 快速开始指南

## 🚀 三步部署

```bash
# 1. 检查环境
./deploy.sh check

# 2. 启动服务
./deploy.sh start

# 3. 测试功能
./deploy.sh test
```

## 📋 常用命令

```bash
./deploy.sh              # 显示帮助信息
./deploy.sh check        # 检查环境
./deploy.sh start        # 启动服务
./deploy.sh stop         # 停止服务
./deploy.sh restart      # 重启服务
./deploy.sh status       # 查看状态
./deploy.sh logs         # 查看日志
./deploy.sh test         # 测试功能
./deploy.sh clean        # 清理容器
./deploy.sh help         # 显示帮助
```

## 🔍 验证部署

```bash
# 健康检查
curl http://localhost:8888/health

# 状态检查
curl http://localhost:8888/status

# 查看容器
docker compose ps

# 查看日志
docker compose logs -f
```

## 📝 配置文件

- **data/map/map-config.json** - 统一配置文件（核心）
- **data/json/*.json** - 服务账号凭证
- **nginx/nginx.conf** - Nginx 主配置
- **nginx/conf.d/gemini-proxy.conf** - 代理配置

## 🌐 访问地址

- 健康检查: http://localhost:8888/health
- 状态查询: http://localhost:8888/status
- API 代理: http://localhost:8888/v1/...

## 🐛 故障排查

```bash
# 查看日志
./deploy.sh logs

# 运行测试
./deploy.sh test

# 查看容器状态
./deploy.sh status

# 检查配置
cat data/map/map-config.json | jq .
```

## 📚 详细文档

- **README_DEPLOYMENT.md** - 文档总览
- **SERVER_DEPLOYMENT.md** - 快速部署指南
- **DEPLOYMENT_GUIDE.md** - 详细部署指南
- **data/map/README-NEW-CONFIG.md** - 配置说明

---

**需要帮助？运行 `./deploy.sh` 或 `./deploy.sh help` 查看完整说明**
