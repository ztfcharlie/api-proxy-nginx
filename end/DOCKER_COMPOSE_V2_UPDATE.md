# Docker Compose V2 更新说明

## 📋 更新内容

已将所有文件中的 `docker-compose` 命令更新为 `docker compose`（Docker Compose V2 语法）。

## 🔄 变更说明

### Docker Compose V1 vs V2

**V1 语法（旧）**：
```bash
docker-compose up -d
docker-compose ps
docker-compose logs -f
```

**V2 语法（新）**：
```bash
docker compose up -d
docker compose ps
docker compose logs -f
```

### 主要区别

1. **命令格式**：
   - V1: `docker-compose`（连字符）
   - V2: `docker compose`（空格）

2. **集成方式**：
   - V1: 独立的 Python 工具
   - V2: 集成到 Docker CLI 中

3. **性能**：
   - V2: 使用 Go 语言重写，性能更好
   - V2: 启动速度更快

## 📝 更新的文件

已更新以下文件中的所有 `docker-compose` 命令：

### 核心文件
- ✅ `deploy.sh` - 部署脚本
- ✅ `test_lua_modules.sh` - 模块测试脚本
- ✅ `test-new-config.sh` - 配置测试脚本

### 文档文件
- ✅ `SERVER_DEPLOYMENT.md` - 快速部署指南
- ✅ `DEPLOYMENT_GUIDE.md` - 详细部署指南
- ✅ `PRE_DEPLOYMENT_CHECKLIST.md` - 部署前检查清单
- ✅ `README_DEPLOYMENT.md` - 文档总览
- ✅ `DEPLOY_SCRIPT_USAGE.md` - deploy.sh 使用说明
- ✅ `QUICK_START.md` - 快速开始指南
- ✅ `TESTING_CHECKLIST.md` - 测试清单
- ✅ `CHANGELOG.md` - 更新日志
- ✅ `SUMMARY.md` - 项目总结
- ✅ `FILES_TO_UPLOAD.txt` - 文件清单
- ✅ `data/map/README-NEW-CONFIG.md` - 配置说明

## 🔍 验证更新

### 检查 Docker Compose 版本

```bash
# 检查是否支持 V2
docker compose version

# 预期输出类似：
# Docker Compose version v2.x.x
```

### 测试命令

```bash
# 测试基本命令
docker compose --help
docker compose ps
docker compose version
```

## 📦 兼容性

### 支持的 Docker 版本

- **Docker 20.10+**: 完全支持 Docker Compose V2
- **Docker 19.03+**: 需要手动安装 Compose V2 插件

### 检查 Docker 版本

```bash
docker --version

# 预期输出：
# Docker version 20.10.0 或更高
```

## 🚀 安装 Docker Compose V2

### 方法 1: 更新 Docker Desktop

如果使用 Docker Desktop，更新到最新版本即可自动包含 Compose V2。

### 方法 2: Linux 手动安装

```bash
# 1. 下载 Compose V2 插件
DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o $DOCKER_CONFIG/cli-plugins/docker-compose

# 2. 添加执行权限
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

# 3. 验证安装
docker compose version
```

### 方法 3: 使用包管理器

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker-compose-plugin

# CentOS/RHEL
sudo yum install docker-compose-plugin

# 验证
docker compose version
```

## ⚠️ 注意事项

### 1. 向后兼容

Docker Compose V2 与 V1 的配置文件（`docker-compose.yml`）完全兼容，无需修改配置文件。

### 2. 命令别名（可选）

如果习惯使用 `docker-compose` 命令，可以创建别名：

```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
alias docker-compose='docker compose'

# 重新加载配置
source ~/.bashrc
```

### 3. CI/CD 更新

如果在 CI/CD 管道中使用 Docker Compose，需要更新脚本：

```yaml
# GitHub Actions 示例
- name: Run docker compose
  run: docker compose up -d
```

### 4. 脚本更新

所有使用 `docker-compose` 的脚本都需要更新为 `docker compose`。

## 📊 性能对比

| 特性 | V1 | V2 |
|------|----|----|
| 语言 | Python | Go |
| 启动速度 | 慢 | 快 |
| 内存占用 | 高 | 低 |
| 集成度 | 独立工具 | Docker CLI 插件 |
| 维护状态 | 停止维护 | 活跃维护 |

## 🔧 常见问题

### Q1: 为什么要更新到 V2？

**A**:
- Docker Compose V1 已停止维护
- V2 性能更好，启动更快
- V2 是 Docker 官方推荐的版本
- V2 集成到 Docker CLI，更易于管理

### Q2: V1 和 V2 可以共存吗？

**A**: 可以，但不推荐。建议完全迁移到 V2。

### Q3: 配置文件需要修改吗？

**A**: 不需要。`docker-compose.yml` 文件格式完全兼容。

### Q4: 如何检查是否已安装 V2？

**A**: 运行 `docker compose version`，如果有输出则已安装。

### Q5: 旧的 docker-compose 命令还能用吗？

**A**: 如果安装了 V1，可以继续使用，但建议迁移到 V2。

## 📚 参考资料

- [Docker Compose V2 官方文档](https://docs.docker.com/compose/cli-command/)
- [从 V1 迁移到 V2](https://docs.docker.com/compose/migrate/)
- [Docker Compose 发布说明](https://github.com/docker/compose/releases)

## ✅ 验证清单

更新后请验证以下内容：

```bash
# 1. 检查 Docker Compose V2 是否安装
□ docker compose version

# 2. 测试基本命令
□ docker compose ps
□ docker compose --help

# 3. 测试部署脚本
□ ./deploy.sh check
□ ./deploy.sh --help

# 4. 测试服务启动
□ docker compose up -d
□ docker compose ps
□ docker compose logs

# 5. 测试服务停止
□ docker compose stop
□ docker compose down
```

## 🎉 总结

所有文件已成功更新为 Docker Compose V2 语法。现在可以：

1. ✅ 使用 `docker compose` 命令（空格）
2. ✅ 享受更快的性能
3. ✅ 使用最新的 Docker 功能
4. ✅ 获得官方支持和更新

---

**更新日期**: 2024-12-01
**版本**: v1.0.0
**状态**: ✅ 完成
