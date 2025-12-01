# OAuth2 + API转发完整流程说明

## 🔄 完整流程图

```
1. 客户端请求
   ↓
2. nginx接收 (gemini-proxy.conf)
   ↓
3. access_by_lua_block 执行
   ↓
4. 客户端认证检查
   ↓
5. OAuth2 Token获取/缓存检查
   ↓
6. 替换Authorization头
   ↓
7. proxy_pass转发到Google API
   ↓
8. Google API响应
   ↓
9. 返回给客户端
```

## 📝 详细步骤说明

### 步骤1: 客户端发送请求
```bash
curl -X POST http://localhost:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \
  -H "Authorization: Bearer gemini-client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
```

### 步骤2: nginx接收请求
- nginx监听8080端口
- 请求匹配location规则: `~ ^/v1/projects/([^/]+)/locations/([^/]+)/publishers/google/models/([^/:]+):(.+)$`
- 提取URL参数:
  - $1 = "carbide-team-478005-f8" (project)
  - $2 = "global" (location)
  - $3 = "gemini-2.5-pro" (model)
  - $4 = "generateContent" (operation)

### 步骤3: access_by_lua_block执行认证
```lua
-- 在 /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf 中
access_by_lua_block {
    local auth_manager = require "auth_manager"
    local utils = require "utils"

    -- 3.1 生成请求ID
    ngx.var.my_request_id = utils.generate_request_id()

    -- 3.2 客户端认证和OAuth2流程
    local client_token, access_token, key_filename = auth_manager.authenticate_client()
    if not client_token then
        return -- 认证失败，已返回错误响应
    end

    -- 3.3 设置变量
    ngx.var.client_token = client_token        -- "gemini-client-key-aaaa"
    ngx.var.access_token = access_token        -- Google OAuth2 access_token
    ngx.var.key_filename = key_filename        -- "service-account.json"

    -- 3.4 提取模型名称
    local model_name = ngx.var[3]              -- "gemini-2.5-pro"
    ngx.var.model_name = model_name

    -- 3.5 获取API主机
    local api_host = auth_manager.get_api_host(key_filename, model_name)
    ngx.var.api_host = api_host                -- "generativelanguage.googleapis.com"

    -- 3.6 替换Authorization头
    ngx.req.clear_header("Authorization")
    ngx.req.set_header("Authorization", "Bearer " .. access_token)

    -- 3.7 设置目标主机
    ngx.req.set_header("Host", api_host)
}
```

### 步骤4: OAuth2 Token获取详细流程

#### 4.1 authenticate_client() 函数执行:
```lua
-- 在 auth_manager_oauth2.lua 中
function _M.authenticate_client()
    -- 4.1.1 提取客户端token
    local client_token = utils.extract_client_token()  -- "gemini-client-key-aaaa"

    -- 4.1.2 验证客户端状态
    local client_status = config.get_client_status(client_token)  -- "enable"

    -- 4.1.3 选择服务账号文件
    local key_filename = select_available_key_file(client_token)  -- "service-account.json"

    -- 4.1.4 获取或刷新OAuth2 Token
    local access_token = get_or_refresh_token(client_token, key_filename)

    return client_token, access_token, key_filename
end
```

#### 4.2 get_or_refresh_token() 详细流程:
```lua
local function get_or_refresh_token(client_token, key_filename)
    local cache_key = "token:" .. key_filename

    -- 4.2.1 检查内存缓存
    local cached_token = token_cache:get(cache_key)
    if cached_token and not is_expired(cached_token) then
        return cached_token.access_token  -- 使用缓存的token
    end

    -- 4.2.2 检查文件缓存
    local file_token = config.read_cached_token(key_filename)
    if file_token and not is_expired(file_token) then
        return file_token.access_token    -- 使用文件缓存的token
    end

    -- 4.2.3 获取新的OAuth2 Token
    local service_account = config.read_service_account(key_filename)
    local token_data = get_oauth2_token(service_account)

    -- 4.2.4 缓存新token
    token_cache:set(cache_key, cjson.encode(token_data), token_data.expires_in)
    config.write_cached_token(key_filename, token_data)

    return token_data.access_token
end
```

#### 4.3 get_oauth2_token() OAuth2请求流程:
```lua
local function get_oauth2_token(service_account)
    -- 4.3.1 创建JWT断言
    local jwt_assertion = oauth2_client.create_jwt_assertion(service_account)

    -- 4.3.2 发送OAuth2请求 (两种方式)

    -- 方式A: 使用nginx subrequest
    local res = ngx.location.capture("/internal/oauth2", {
        method = ngx.HTTP_POST,
        body = "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" .. jwt_assertion
    })

    -- 方式B: 使用curl (备用)
    if not res or res.status ~= 200 then
        local cmd = "curl -s -X POST 'https://oauth2.googleapis.com/token' " ..
                   "-H 'Content-Type: application/x-www-form-urlencoded' " ..
                   "-d 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" .. jwt_assertion .. "'"
        local handle = io.popen(cmd)
        local response = handle:read("*a")
        handle:close()
    end

    -- 4.3.3 解析响应
    local token_data = cjson.decode(response_body)
    return token_data  -- { access_token: "ya29.xxx", expires_in: 3600, ... }
end
```

### 步骤5: JWT创建详细过程
```lua
-- 在 oauth2_client.lua 中
function create_jwt_assertion(service_account)
    -- 5.1 创建JWT Header
    local header = {
        alg = "RS256",
        typ = "JWT"
    }
    local header_b64 = base64url_encode(cjson.encode(header))

    -- 5.2 创建JWT Payload
    local now = ngx.time()
    local payload = {
        iss = service_account.client_email,           -- "service@project.iam.gserviceaccount.com"
        scope = "https://www.googleapis.com/auth/cloud-platform",
        aud = "https://oauth2.googleapis.com/token",
        exp = now + 3600,
        iat = now
    }
    local payload_b64 = base64url_encode(cjson.encode(payload))

    -- 5.3 创建签名
    local unsigned_jwt = header_b64 .. "." .. payload_b64
    local signature = sign_with_openssl(unsigned_jwt, service_account.private_key)

    -- 5.4 组装完整JWT
    return unsigned_jwt .. "." .. signature
end
```

### 步骤6: proxy_pass转发到Google API
```nginx
# 在 gemini-proxy.conf 中
proxy_pass https://$api_host;

# 实际转发的请求:
# POST https://generativelanguage.googleapis.com/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent
# Authorization: Bearer ya29.c.c0ASRK0GbCHU8... (真实的Google access_token)
# Host: generativelanguage.googleapis.com
# Content-Type: application/json
#
# {"contents":[{"parts":[{"text":"Hello"}]}]}
```

### 步骤7: Google API处理和响应
```json
// Google API验证access_token并处理请求
// 返回响应:
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "Hello! How can I help you today?"
          }
        ],
        "role": "model"
      }
    }
  ]
}
```

### 步骤8: nginx返回响应给客户端
- nginx接收Google API响应
- 执行 `header_filter_by_lua_block` 清理响应头
- 执行 `body_filter_by_lua_block` 处理响应体
- 执行 `log_by_lua_block` 记录日志
- 返回最终响应给客户端

## 🔧 配置文件映射

### 客户端映射 (data/map/map-config.json):
```json
{
  "clients": [
    {
      "client_token": "gemini-client-key-aaaa",
      "enable": true,
      "key_filename_gemini": [
        {
          "key_filename": "carbide-team-service-account.json",
          "key_weight": 1
        }
      ]
    }
  ],
  "key_filename_gemini": [
    {
      "key_filename": "carbide-team-service-account.json",
      "models": [
        {
          "model": "gemini-2.5-pro",
          "domain": "generativelanguage.googleapis.com"
        }
      ]
    }
  ]
}
```

### 服务账号文件 (data/json/carbide-team-service-account.json):
```json
{
  "type": "service_account",
  "project_id": "carbide-team-478005-f8",
  "private_key_id": "xxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "service@carbide-team-478005-f8.iam.gserviceaccount.com",
  "client_id": "xxx",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

## ⚡ 性能优化特性

1. **Token缓存**: 避免重复OAuth2请求
2. **权重负载均衡**: 多个服务账号轮询
3. **提前刷新**: token过期前自动刷新
4. **故障转移**: 主方法失败时使用备用方法
5. **连接复用**: nginx内置连接池

## 🔍 调试和监控

- 详细的日志记录每个步骤
- 请求ID跟踪整个流程
- 性能指标收集
- 错误统计和告警