# 更新日志

## [1.0.0] - 2024-12-01

### ✨ 新增功能

#### 核心功能
- **Lazy Loading Token 获取机制** - Token 按需获取，避免启动失败
- **多服务支持** - 通过 client_token 前缀自动识别服务类型（gemini-, claude-）
- **权重负载均衡** - 支持多个服务账号的权重分配
- **三级缓存系统** - 内存缓存 → 文件缓存 → OAuth2 API
- **统一配置管理** - 单一配置文件（map-config.json）整合三个旧文件

#### 部署脚本（deploy.sh）
- **智能帮助系统** ⭐
  - 无参数运行自动显示详细的使用说明
  - 支持多种调用方式：`./deploy.sh`、`./deploy.sh help`、`./deploy.sh --help`、`./deploy.sh -h`
  - 包含功能说明、使用方法、命令详解、使用示例、项目结构等
  - 使用 Unicode 字符美化输出（表格、图标、分隔线）
- **环境检查** - 自动验证 Docker、配置文件、JSON 格式
- **一键部署** - check + build + start 自动化流程
- **实时监控** - 查看状态、日志、资源使用
- **自动测试** - 测试健康检查、状态、API 转发
- **彩色输出** - 蓝色信息、绿色成功、黄色警告、红色错误

#### Docker 配置
- **Dockerfile.new** - 基于 `openresty/openresty:alpine-fat` 镜像
- **docker-compose.new.yml** - 完整的服务编排配置
- 自动安装 lua-resty-http 模块
- 配置健康检查和日志轮转
- 优化卷挂载（只读/读写分离）

### 📝 代码更新

#### config.lua
- 新增 `parse_service_type()` - 解析服务类型前缀
- 新增 `load_map_config()` - 加载统一配置文件
- 新增 `get_client_config()` - 获取客户端配置
- 新增 `get_client_key_files()` - 获取服务账号列表（支持权重）
- 新增 `get_model_domain()` - 获取模型域名
- 移除旧的配置加载函数

#### auth_manager.lua
- 新增 `select_key_file_by_weight()` - 权重选择算法
- 重写 `select_available_key_file()` - 支持多服务账号
- 重写 `get_or_refresh_token()` - 实现 Lazy Loading
- 更新 `authenticate_client()` - 返回 client_token, access_token, key_filename
- 更新 `get_api_host()` - 使用新的参数
- 移除 `warmup_tokens()` - 不再预热 Token

#### utils.lua
- 新增 `extract_client_token()` - 提取客户端令牌
- 更新 `log_request()` - 记录新的变量（client_token, key_filename）
- 保持向后兼容（extract_client_id 别名）

#### nginx 配置
- 更新变量定义：client_token, key_filename, access_token
- 更新 access_by_lua_block 使用新的认证流程
- 更新请求转发逻辑

### 📚 文档

#### 新增文档
- **README_DEPLOYMENT.md** - 文档总览和索引
- **SERVER_DEPLOYMENT.md** - 快速部署指南（三步完成）
- **PRE_DEPLOYMENT_CHECKLIST.md** - 部署前完整检查清单
- **DEPLOYMENT_GUIDE.md** - 详细部署指南（包含故障排查）
- **DEPLOY_SCRIPT_USAGE.md** - deploy.sh 详细使用说明 ⭐
- **QUICK_START.md** - 快速开始指南
- **data/map/README-NEW-CONFIG.md** - 配置文件详细说明
- **TESTING_CHECKLIST.md** - 测试检查清单
- **FILES_TO_UPLOAD.txt** - 文件上传清单
- **SUMMARY.md** - 项目完成总结

#### 文档特点
- 完整覆盖从准备到维护的全流程
- 包含大量使用示例和命令
- 详细的故障排查指南
- 性能优化建议
- 安全配置建议

### 🧪 测试

#### 单元测试
- tests/test_config.lua - 配置模块测试
- tests/test_utils.lua - 工具函数测试
- tests/run_tests.sh - 测试运行脚本

#### 集成测试
- test_lua_modules.sh - 模块加载测试
- test-new-config.sh - API 请求测试
- check_lua_syntax.sh - 语法检查
- test_deploy_help.sh - 帮助信息测试

### 🔧 配置文件

#### map-config.json
- 统一配置结构
- 支持多服务类型（gemini, claude）
- 支持权重负载均衡
- 包含完整示例配置

### 🎯 核心改进

1. **启动可靠性** ⬆️
   - Lazy Loading 避免过期凭证导致启动失败
   - 错误隔离到具体客户端
   - 服务启动不依赖外部 API

2. **配置管理** ⬆️
   - 单一配置文件，易于维护
   - 结构清晰，支持多服务
   - 易于扩展新服务类型

3. **负载均衡** ⬆️
   - 支持权重配置
   - 自动故障转移
   - 优先使用有效 Token 的账号

4. **用户体验** ⬆️
   - 智能帮助系统
   - 彩色输出
   - 详细的文档
   - 一键部署

5. **可维护性** ⬆️
   - 完整的测试脚本
   - 详细的日志记录
   - 清晰的错误信息
   - 故障排查指南

### 📊 技术栈

- **OpenResty**: openresty/openresty:alpine-fat
- **Lua 模块**: lua-cjson (内置), lua-resty-http (安装)
- **Redis**: redis:7-alpine
- **Docker**: 20.10+
- **Docker Compose**: 1.29+

### 🚀 部署方式

#### 旧方式（手动）
```bash
docker build -t api-proxy .
docker-compose up -d
```

#### 新方式（一键）
```bash
./deploy.sh start
```

### 📈 性能优化

- 三级缓存减少 API 调用
- 内存缓存提高响应速度
- 文件缓存持久化 Token
- 按需加载减少资源消耗

### 🔐 安全增强

- 移除预热功能，避免泄露过期凭证
- 错误信息不包含敏感数据
- 支持权限分离（只读/读写）
- 日志级别可配置

### 🐛 已知问题

无

### 📝 待办事项

- [ ] 添加 HTTPS 支持示例
- [ ] 添加监控和告警配置示例
- [ ] 添加性能测试脚本
- [ ] 添加自动备份脚本

### 🙏 致谢

感谢 OpenResty 社区提供优秀的 Web 平台。

---

## 使用说明

### 查看帮助
```bash
./deploy.sh
```

### 快速部署
```bash
./deploy.sh check
./deploy.sh start
./deploy.sh test
```

### 查看文档
```bash
cat README_DEPLOYMENT.md
cat DEPLOY_SCRIPT_USAGE.md
cat QUICK_START.md
```

---

**版本**: v1.0.0
**发布日期**: 2024-12-01
**许可**: MIT
