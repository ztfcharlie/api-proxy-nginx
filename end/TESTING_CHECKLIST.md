# 测试检查清单

## 代码审查完成 ✓

### 1. config.lua 模块
- ✓ 语法检查：无明显语法错误
- ✓ 新增函数：
  - `parse_service_type()` - 解析服务类型前缀
  - `load_map_config()` - 加载统一配置文件
  - `get_client_config()` - 获取客户端配置
  - `get_client_key_files()` - 获取服务账号列表
  - `get_model_domain()` - 获取模型域名
- ✓ 移除旧函数：
  - `load_client_maps()` - 已替换为 `load_map_config()`
  - `get_client_json_files()` - 已替换为 `get_client_key_files()`
  - `get_model_api_host()` - 已替换为 `get_model_domain()`

### 2. auth_manager.lua 模块
- ✓ 语法检查：无明显语法错误
- ✓ 新增函数：
  - `select_key_file_by_weight()` - 权重选择
  - `select_available_key_file()` - 选择可用服务账号
- ✓ 修改函数：
  - `get_or_refresh_token()` - 实现 Lazy Loading
  - `authenticate_client()` - 返回 client_token, access_token, key_filename
  - `get_api_host()` - 使用新参数
- ✓ 移除函数：
  - `warmup_tokens()` - 不再预热 Token

### 3. utils.lua 模块
- ✓ 语法检查：无明显语法错误
- ✓ 新增函数：
  - `extract_client_token()` - 提取客户端令牌
- ✓ 修改函数：
  - `log_request()` - 记录新变量

### 4. nginx 配置
- ✓ 语法检查：无明显语法错误
- ✓ 变量更新：
  - `$client_token` (替换 $client_id)
  - `$key_filename` (新增)
  - `$access_token` (替换 $google_token)
- ✓ 逻辑更新：access_by_lua_block 使用新的认证流程

### 5. 配置文件
- ✓ map-config.json 结构正确
- ✓ 包含示例客户端配置
- ✓ 包含 gemini 和 claude 服务账号配置

## 需要运行时测试的项目

### 启动前检查
```bash
# 1. 检查配置文件是否存在
ls -la data/map/map-config.json
ls -la data/json/*.json

# 2. 检查 JSON 格式
cat data/map/map-config.json | jq .

# 3. 检查 Nginx 配置语法（需要容器）
docker compose exec api-proxy-nginx nginx -t
```

### 启动测试
```bash
# 1. 启动服务
docker compose up -d

# 2. 查看启动日志
docker compose logs api-proxy-nginx | grep -i "configuration"

# 预期输出：
# [INFO] Configuration loaded successfully
```

### 功能测试

#### 测试 1: 配置加载
```bash
curl http://localhost:8888/status | jq .

# 预期输出：
# {
#   "status": "running",
#   "config_loaded": true,
#   "timestamp": ...
# }
```

#### 测试 2: 客户端认证（启用的客户端）
```bash
curl -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "Hello"}]}]}' \
  -v

# 预期：
# - 返回 401/403/500 或成功响应（取决于服务账号是否有效）
# - 日志中显示 Token 获取过程
```

#### 测试 3: 禁用的客户端
```bash
curl -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent \
  -H "Authorization: Bearer gemini-client-key-bbbb" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "Hello"}]}]}' \
  -v

# 预期：
# - 返回 403 Forbidden
# - 错误信息: "Client disabled"
```

#### 测试 4: 不存在的客户端
```bash
curl -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent \
  -H "Authorization: Bearer non-existent-client" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "Hello"}]}]}' \
  -v

# 预期：
# - 返回 403 Forbidden
# - 错误信息: "Client not found"
```

#### 测试 5: Lazy Loading
```bash
# 清空 Token 缓存
rm -f data/jwt/*.json

# 发送请求
curl -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "Hello"}]}]}'

# 查看日志
docker compose logs api-proxy-nginx | grep "oauth_process"

# 预期日志：
# [TEST] Token expired or not found, requesting new token for: hulaoban-202504.json
# [TEST] Requesting OAuth2 token from: https://oauth2.googleapis.com/token
# [TEST] Token acquired and cached for: hulaoban-202504.json

# 检查缓存文件是否创建
ls -la data/jwt/
```

#### 测试 6: 权重负载均衡
```bash
# 使用有多个服务账号的客户端
# 多次请求，观察日志中选择的服务账号文件

for i in {1..10}; do
  curl -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent \
    -H "Authorization: Bearer gemini-client-key-bbbb" \
    -H "Content-Type: application/json" \
    -d '{"contents": [{"parts": [{"text": "Hello"}]}]}' \
    -s > /dev/null
  sleep 1
done

# 查看日志，统计选择的文件
docker compose logs api-proxy-nginx | grep "Selected key file"

# 预期：
# company-vertex-1.json 出现次数约为 company-vertex-2.json 的 2 倍
```

#### 测试 7: 模型域名路由
```bash
# 测试不同模型
curl -X POST http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-embedding-001:predict \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"instances": [{"content": "test"}]}'

# 查看日志中的 api_host
docker compose logs api-proxy-nginx | grep "api_host"

# 预期：
# gemini-embedding-001 -> us-central1-aiplatform.googleapis.com
# gemini-3-pro-preview -> aiplatform.googleapis.com
```

### 日志检查

```bash
# 查看完整日志
docker compose logs -f api-proxy-nginx

# 关键日志项：
# 1. 配置加载
grep "Configuration loaded" logs/access.log

# 2. 客户端认证
grep "client_token" logs/access.log

# 3. Token 获取
grep "oauth_process" logs/access.log

# 4. 请求转发
grep "REQUEST" logs/access.log
```

## 已知限制

1. **服务账号文件必须存在**
   - 如果 data/json/ 中的文件不存在，会在请求时报错
   - 这是预期行为（Lazy Loading）

2. **过期的服务账号**
   - 过期的服务账号会在请求时返回错误
   - 不会影响其他客户端

3. **权重选择是随机的**
   - 每次请求可能选择不同的服务账号
   - 长期统计会接近配置的权重比例

## 故障排查

### 问题 1: 配置加载失败
```bash
# 检查日志
docker compose logs api-proxy-nginx | grep "Cannot load"

# 可能原因：
# - map-config.json 格式错误
# - 文件路径错误
# - 权限问题

# 解决方法：
# 1. 验证 JSON 格式: cat data/map/map-config.json | jq .
# 2. 检查文件权限: ls -la data/map/map-config.json
# 3. 查看详细错误日志
```

### 问题 2: Token 获取失败
```bash
# 检查日志
docker compose logs api-proxy-nginx | grep "Failed to get OAuth2 token"

# 可能原因：
# - 服务账号文件不存在
# - 服务账号已过期
# - 网络问题

# 解决方法：
# 1. 检查文件: ls -la data/json/hulaoban-202504.json
# 2. 验证服务账号: cat data/json/hulaoban-202504.json | jq .
# 3. 测试网络: curl https://oauth2.googleapis.com/token
```

### 问题 3: 模型不支持
```bash
# 检查日志
docker compose logs api-proxy-nginx | grep "Model not supported"

# 可能原因：
# - 模型名称在配置中不存在
# - 服务账号没有配置该模型

# 解决方法：
# 1. 检查 map-config.json 中的 models 配置
# 2. 确认模型名称拼写正确
```

## 性能测试

```bash
# 使用 ab 或 wrk 进行压力测试
ab -n 1000 -c 10 \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -p request.json \
  http://localhost:8888/v1/projects/test/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent

# 观察：
# 1. Token 缓存命中率
# 2. 响应时间
# 3. 错误率
```

## 总结

✓ 代码审查完成，无明显语法错误
✓ 逻辑实现符合需求
✓ 测试脚本已准备
⚠ 需要在运行环境中进行实际测试

**下一步：启动容器并运行功能测试**
