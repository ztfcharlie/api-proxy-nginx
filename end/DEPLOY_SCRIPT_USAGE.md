# deploy.sh 使用说明

## 📖 概述

`deploy.sh` 是一个功能完整的一键部署脚本，用于快速部署和管理 API Proxy 服务。

## 🎯 核心特性

### 1. 智能帮助系统

**无参数运行时自动显示帮助**：
```bash
./deploy.sh
```

这将显示：
- 📖 功能说明
- 🚀 使用方法
- 📋 可用命令详解
- 💡 使用示例
- 📁 项目结构
- 🌐 服务端口
- 📚 相关文档
- ⚠️ 注意事项
- 🆘 获取帮助

### 2. 多种帮助调用方式

```bash
./deploy.sh          # 无参数，显示帮助
./deploy.sh help     # help 命令
./deploy.sh --help   # --help 参数
./deploy.sh -h       # -h 参数
```

### 3. 彩色输出

脚本使用彩色输出，提高可读性：
- 🔵 蓝色 - 信息提示 [INFO]
- 🟢 绿色 - 成功消息 [SUCCESS]
- 🟡 黄色 - 警告信息 [WARNING]
- 🔴 红色 - 错误消息 [ERROR]

## 📋 可用命令

### check - 检查环境
```bash
./deploy.sh check
```

**功能**：
- ✅ 验证 Docker 和 Docker Compose 是否安装
- ✅ 检查必需的配置文件是否存在
- ✅ 验证 JSON 配置格式
- ✅ 自动创建必要的目录
- ✅ 设置正确的权限

**输出示例**：
```
[INFO] 检查部署环境...
[SUCCESS] Docker 已安装: Docker version 20.10.0
[SUCCESS] Docker Compose 已安装: docker compose version 1.29.0
[SUCCESS] Docker 服务正在运行
[SUCCESS] ✓ data/map/map-config.json
[SUCCESS] map-config.json 格式正确
[SUCCESS] 环境检查完成！
```

### build - 构建镜像
```bash
./deploy.sh build
```

**功能**：
- 🔧 自动检查环境
- 🏗️ 使用 openresty/openresty:alpine-fat 基础镜像
- 📦 安装必需的 Lua 模块（lua-resty-http）
- ⚙️ 配置健康检查和日志

**输出示例**：
```
[INFO] 准备构建 Docker 镜像...
[INFO] 使用新的 docker compose 配置...
[INFO] 开始构建镜像（这可能需要几分钟）...
[SUCCESS] 镜像构建完成！
```

### start - 启动服务
```bash
./deploy.sh start
```

**功能**：
- ✅ 自动执行环境检查
- 🏗️ 自动构建镜像（如果需要）
- 🚀 启动 OpenResty 和 Redis 容器
- ⏱️ 等待服务就绪（30秒）
- 📊 显示服务状态
- 🌐 显示访问地址

**输出示例**：
```
[INFO] 启动服务...
[INFO] 等待服务启动（30秒）...
[INFO] 检查服务状态...
NAME                  STATUS              PORTS
api-proxy-nginx       Up (healthy)        0.0.0.0:8888->8080/tcp
api-proxy-redis       Up (healthy)        0.0.0.0:6379->6379/tcp
[SUCCESS] 服务已启动！

[INFO] 访问地址:
  - 健康检查: http://localhost:8888/health
  - 状态检查: http://localhost:8888/status
```

### stop - 停止服务
```bash
./deploy.sh stop
```

**功能**：
- 🛑 优雅停止所有容器
- 💾 保留数据和配置

### restart - 重启服务
```bash
./deploy.sh restart
```

**功能**：
- 🔄 快速重启容器
- ⚡ 适用于配置更新后

**使用场景**：
```bash
# 修改配置后重启
vim data/map/map-config.json
./deploy.sh restart
```

### status - 查看状态
```bash
./deploy.sh status
```

**功能**：
- 📊 显示容器运行状态
- 💻 显示资源使用情况（CPU、内存）

**输出示例**：
```
[INFO] 服务状态:

NAME                  STATUS              PORTS
api-proxy-nginx       Up (healthy)        0.0.0.0:8888->8080/tcp
api-proxy-redis       Up (healthy)        0.0.0.0:6379->6379/tcp

[INFO] 容器资源使用:

CONTAINER           CPU %     MEM USAGE / LIMIT     MEM %
api-proxy-nginx     0.50%     150MiB / 2GiB        7.32%
api-proxy-redis     0.10%     20MiB / 256MiB       7.81%
```

### logs - 查看日志
```bash
./deploy.sh logs
```

**功能**：
- 📜 实时显示最近 100 行日志
- 🔄 持续跟踪新日志
- ⌨️ 按 Ctrl+C 退出

**使用技巧**：
```bash
# 查看实时日志
./deploy.sh logs

# 或直接使用 docker compose
docker compose logs -f --tail=100 api-proxy-nginx
docker compose logs -f --tail=100 api-proxy-redis
```

### test - 测试服务
```bash
./deploy.sh test
```

**功能**：
- ✅ 测试健康检查端点
- ✅ 测试状态端点
- ✅ 测试 API 请求转发
- 📜 显示最近的日志

**输出示例**：
```
[INFO] 测试服务...

[INFO] 1. 测试健康检查端点...
[SUCCESS] 健康检查通过
{"status":"ok","timestamp":1234567890,"version":"1.0.0"}

[INFO] 2. 测试状态端点...
[SUCCESS] 状态检查通过
{"status":"running","config_loaded":true,"timestamp":1234567890}

[INFO] 3. 测试 API 请求（使用 gemini-client-key-aaaa）...
[SUCCESS] API 请求已转发（HTTP 200）
```

### clean - 清理容器
```bash
./deploy.sh clean
```

**功能**：
- 🛑 停止并删除所有容器
- 🗑️ 删除构建的镜像
- 🧹 清理 Token 缓存
- ⚠️ 需要确认操作

**安全提示**：
```
[WARNING] 这将删除所有容器、镜像和数据！
确定要继续吗？(yes/no):
```

## 💡 使用场景

### 场景 1: 首次部署

```bash
# 1. 查看帮助，了解功能
./deploy.sh

# 2. 检查环境
./deploy.sh check

# 3. 启动服务
./deploy.sh start

# 4. 测试功能
./deploy.sh test
```

### 场景 2: 日常维护

```bash
# 查看服务状态
./deploy.sh status

# 查看日志
./deploy.sh logs

# 重启服务
./deploy.sh restart
```

### 场景 3: 配置更新

```bash
# 1. 修改配置
vim data/map/map-config.json

# 2. 验证 JSON 格式
cat data/map/map-config.json | jq .

# 3. 重启服务
./deploy.sh restart

# 4. 验证配置加载
curl http://localhost:8888/status
```

### 场景 4: 故障排查

```bash
# 1. 查看日志
./deploy.sh logs

# 2. 运行测试
./deploy.sh test

# 3. 查看状态
./deploy.sh status

# 4. 检查容器
docker compose ps
```

### 场景 5: 完全重建

```bash
# 1. 清理旧环境
./deploy.sh clean

# 2. 重新构建
./deploy.sh build

# 3. 启动服务
./deploy.sh start

# 4. 测试功能
./deploy.sh test
```

## 🔧 高级用法

### 组合使用

```bash
# 检查 + 构建 + 启动 + 测试（一条命令）
./deploy.sh check && ./deploy.sh build && ./deploy.sh start && ./deploy.sh test
```

### 后台运行

```bash
# 启动服务后立即返回
./deploy.sh start &

# 查看后台任务
jobs

# 等待完成
wait
```

### 定时任务

```bash
# 添加到 crontab，每天凌晨 2 点重启
crontab -e

# 添加：
0 2 * * * cd /home/user/end && ./deploy.sh restart >> /var/log/deploy.log 2>&1
```

## 📊 输出说明

### 颜色含义

- **蓝色 [INFO]**: 信息提示，正常操作
- **绿色 [SUCCESS]**: 操作成功
- **黄色 [WARNING]**: 警告信息，需要注意
- **红色 [ERROR]**: 错误信息，操作失败

### 退出码

- `0` - 成功
- `1` - 失败

**使用示例**：
```bash
./deploy.sh check
if [ $? -eq 0 ]; then
    echo "环境检查通过"
else
    echo "环境检查失败"
fi
```

## 🐛 故障排查

### 问题 1: 命令未找到

```bash
# 确保脚本有执行权限
chmod +x deploy.sh

# 使用 bash 显式运行
bash deploy.sh check
```

### 问题 2: Docker 未运行

```bash
# 启动 Docker
sudo systemctl start docker

# 检查状态
sudo systemctl status docker
```

### 问题 3: 权限不足

```bash
# 将用户添加到 docker 组
sudo usermod -aG docker $USER

# 重新登录或运行
newgrp docker
```

### 问题 4: 端口被占用

```bash
# 查看占用进程
sudo netstat -tlnp | grep 8888

# 修改端口（编辑 docker compose.yml）
vim docker compose.yml
# 修改: "8889:8080"
```

## 📚 相关文档

- **QUICK_START.md** - 快速开始指南
- **SERVER_DEPLOYMENT.md** - 服务器部署指南
- **DEPLOYMENT_GUIDE.md** - 详细部署指南
- **README_DEPLOYMENT.md** - 文档总览

## 🎉 总结

`deploy.sh` 提供了完整的部署和管理功能：

✅ **智能帮助** - 无参数运行自动显示详细说明
✅ **环境检查** - 自动验证和配置环境
✅ **一键部署** - 自动化构建、启动、测试
✅ **实时监控** - 查看状态、日志、资源使用
✅ **故障排查** - 内置测试和诊断功能
✅ **安全清理** - 需要确认的清理操作

---

**开始使用**: 运行 `./deploy.sh` 查看完整帮助信息
