local cjson = require "cjson"
local config = require "config"
local redis = require "resty.redis"
local _M = {}

-- 获取 Redis 连接 (复用逻辑)
local function get_redis_connection()
    local red = redis:new()
    red:set_timeout(1000) -- 1秒超时，日志不应阻塞太久

    local redis_conf = config.get_redis_config()
    
    local ok, err = red:connect(redis_conf.host, redis_conf.port)
    if not ok then
        return nil, err
    end

    if redis_conf.password and redis_conf.password ~= "" then
        local res, err = red:auth(redis_conf.password)
        if not res then
            return nil, err
        end
    end
    
    if redis_conf.db and redis_conf.db ~= 0 then
        red:select(redis_conf.db)
    end

    return red
end

-- 生成请求ID
function _M.generate_request_id()
    return ngx.var.pid .. "-" .. ngx.time() .. "-" .. math.random(1000, 9999)
end

-- 错误响应
function _M.error_response(status, message)
    ngx.status = status
    ngx.header.content_type = "application/json"
    ngx.say(cjson.encode({
        error = message,
        status = status,
        timestamp = ngx.time(),
        request_id = ngx.var.request_id
    }))
    ngx.exit(status)
end

-- 移除隐私相关头部
function _M.remove_privacy_headers()
    local privacy_headers = {
        "X-Forwarded-For",
        "X-Real-IP",
        "X-Client-IP",
        "X-Forwarded-Host",
        "X-Forwarded-Proto",
        "Via",
        "Referer",
        "Origin",
        "User-Agent"
    }

    for _, header in ipairs(privacy_headers) do
        ngx.req.clear_header(header)
    end

    if config.should_test_output("upstream_headers") then
        ngx.log(ngx.INFO, "[TEST] Removed privacy headers: ", table.concat(privacy_headers, ", "))
    end
end

-- 清理响应头部
function _M.clean_response_headers()
    local response_headers_to_remove = {
        "x-goog-api-key",
        "x-goog-gapi-key",
        "server",
        "x-content-type-options",
        "x-frame-options",
        "content-disposition"  -- 移除这个头部，防止客户端将流式响应视为文件下载
    }

    for _, header in ipairs(response_headers_to_remove) do
        ngx.header[header] = nil
    end
end

-- [Log] 异步发送日志到 Redis Stream
function _M.log_request()
    -- 仅在后台运行，防止错误中断请求
    local ok, err = pcall(function()
        local red, err = get_redis_connection()
        if not red then
            ngx.log(ngx.ERR, "[LOG] Failed to connect to Redis for logging: ", err)
            return
        end

        -- 1. 收集元数据
        local metadata = {
            client_token = ngx.var.client_token,
            key_filename = ngx.var.key_filename,
            model_name = ngx.var.model_name,
            api_host = ngx.var.api_host,
            method = ngx.var.request_method,
            uri = ngx.var.request_uri,
            status = ngx.status,
            request_time = ngx.var.request_time,
            upstream_status = ngx.var.upstream_status,
            upstream_response_time = ngx.var.upstream_response_time or 0,
            ip = ngx.var.remote_addr
        }

        -- 2. 获取 Request Body
        -- ngx.req.get_body_data() 在内存中，get_body_file() 在磁盘中
        local req_body = ngx.req.get_body_data()
        if not req_body then
            local req_file = ngx.req.get_body_file()
            if req_file then
                -- 暂时不读取大文件，标记为文件路径
                req_body = "[FILE]: " .. req_file
            else
                req_body = ""
            end
        end

        -- 3. 获取 Response Body
        -- 优先使用 stream_handler 拼接的完整 buffer
        -- 如果没有 buffer (非流式请求且没经过 body_filter)，尝试 ngx.arg (这在 log_by_lua 无效)
        -- 注意：对于非流式普通请求，Nginx 默认不保留 Body 给 log_by_lua。
        -- 但因为我们有 body_filter_by_lua 并在 stream_handler 里统一做了处理，理论上 buffered_response 应该有值。
        -- 如果是普通请求但没触发 stream 逻辑，可能需要检查。
        local res_body = ngx.ctx.buffered_response or ""
        
        -- 截断超大 Body 防止 Redis 拒绝
        if #req_body > 100000 then req_body = string.sub(req_body, 1, 100000) .. "...(truncated)" end
        if #res_body > 100000 then res_body = string.sub(res_body, 1, 100000) .. "...(truncated)" end

        -- 4. 429 频率监测 (即时计数)
        if ngx.status == 429 then
            local token_prefix = string.sub(ngx.var.client_token or "unknown", 1, 10)
            -- 增加计数: alert:429:token:xxx
            red:incr("alert:429:token:" .. token_prefix)
            red:expire("alert:429:token:" .. token_prefix, 3600) -- 1小时过期
        end

        -- 5. 发送 Stream 消息 (XADD)
        -- Stream Key: stream:api_logs
        -- MAXLEN ~ 100000
        local res, err = red:xadd("stream:api_logs", "MAXLEN", "~", "100000", "*",
            "req_id", ngx.var.my_request_id or ngx.var.request_id,
            "ts", ngx.time(),
            "meta", cjson.encode(metadata),
            "req_body", req_body,
            "res_body", res_body
        )

        if not res then
            ngx.log(ngx.ERR, "[LOG] Failed to XADD to stream: ", err)
        end

        -- 连接池归还
        red:set_keepalive(10000, 10)
    end)

    if not ok then
        ngx.log(ngx.ERR, "[LOG] Lua error in log_request: ", err)
    end
end

-- 提取模型名称 (支持 Vertex URL 和 OpenAI Body)
function _M.extract_model_name(uri)
    -- 1. 尝试从 Vertex URL 提取
    local model_name = uri:match("/models/([^/:]+)")
    if model_name then return model_name end

    -- 2. 尝试从 Request Body 提取 (OpenAI Style)
    -- 只有在 Content-Type 是 application/json 时才尝试
    local headers = ngx.req.get_headers()
    local content_type = headers["content-type"]
    if not content_type or not string.find(content_type, "application/json") then
        return "default"
    end

    -- 强制读取 Body
    ngx.req.read_body()
    local body_data = ngx.req.get_body_data()

    if not body_data then
        -- Body 可能被写入了临时文件 (太大了)
        return "default"
    end

    -- 从环境变量获取限制，默认 512KB
    local limit_str = os.getenv("LUA_BODY_PARSE_LIMIT")
    local parse_limit = tonumber(limit_str) or 524288

    if #body_data > parse_limit then
        return "default"
    end

    local ok, json_body = pcall(cjson.decode, body_data)
    if ok and json_body and json_body.model then
        return json_body.model
    end

    return "default"
end

-- 提取客户端 Token 从 Authorization 头部
function _M.extract_client_token()
    ngx.log(ngx.INFO, "[EXTRACT-DEBUG] ===== Extracting Client Token =====")

    -- 获取所有请求头部用于调试
    local headers = ngx.req.get_headers()
    ngx.log(ngx.INFO, "[EXTRACT-DEBUG] All request headers:")
    for name, value in pairs(headers) do
        if name:lower() == "authorization" then
            ngx.log(ngx.INFO, "[EXTRACT-DEBUG]   ", name, ": ", value)
        else
            ngx.log(ngx.INFO, "[EXTRACT-DEBUG]   ", name, ": ", _M.truncate_string(tostring(value), 100))
        end
    end

    local auth_header = ngx.var.http_authorization
    ngx.log(ngx.INFO, "[EXTRACT-DEBUG] Authorization header from ngx.var: ", auth_header or "nil")

    -- 也尝试从请求头部直接获取
    local auth_header_direct = ngx.req.get_headers()["Authorization"] or ngx.req.get_headers()["authorization"]
    ngx.log(ngx.INFO, "[EXTRACT-DEBUG] Authorization header direct: ", auth_header_direct or "nil")

    -- 使用可用的头部
    auth_header = auth_header or auth_header_direct

    if not auth_header then
        ngx.log(ngx.ERR, "[EXTRACT-DEBUG] Missing Authorization header")
        return nil, "Missing Authorization header"
    end

    ngx.log(ngx.INFO, "[EXTRACT-DEBUG] Found Authorization header: ", auth_header)
    ngx.log(ngx.INFO, "[EXTRACT-DEBUG] Authorization header length: ", string.len(auth_header))

    -- 匹配 Bearer token 格式
    local client_token = auth_header:match("^Bearer%s+(.+)$")
    if not client_token then
        ngx.log(ngx.ERR, "[EXTRACT-DEBUG] Invalid Authorization header format")
        ngx.log(ngx.ERR, "[EXTRACT-DEBUG] Expected format: 'Bearer <token>'")
        ngx.log(ngx.ERR, "[EXTRACT-DEBUG] Actual format: ", auth_header)
        return nil, "Invalid Authorization header format"
    end

    ngx.log(ngx.INFO, "[EXTRACT-DEBUG] Successfully extracted client token: ", client_token)
    ngx.log(ngx.INFO, "[EXTRACT-DEBUG] Client token length: ", string.len(client_token))
    ngx.log(ngx.INFO, "[EXTRACT-DEBUG] ===== Client Token Extraction Complete =====")

    return client_token
end

-- 向后兼容的别名
function _M.extract_client_id()
    return _M.extract_client_token()
end

-- Base64 编码
function _M.base64_encode(data)
    return ngx.encode_base64(data)
end

-- Base64 解码
function _M.base64_decode(data)
    return ngx.decode_base64(data)
end

-- URL 安全的 Base64 编码
function _M.base64url_encode(data)
    local b64 = ngx.encode_base64(data)
    -- 替换字符使其 URL 安全
    b64 = b64:gsub("+", "-"):gsub("/", "_"):gsub("=", "")
    return b64
end

-- 创建 JWT Header
function _M.create_jwt_header()
    local header = {
        alg = "RS256",
        typ = "JWT"
    }
    return _M.base64url_encode(cjson.encode(header))
end

-- 创建 JWT Payload
function _M.create_jwt_payload(service_account)
    local now = ngx.time()
    local payload = {
        iss = service_account.client_email,
        scope = "https://www.googleapis.com/auth/cloud-platform",
        aud = "https://oauth2.googleapis.com/token",
        exp = now + 3600, -- 1小时后过期
        iat = now
    }
    return _M.base64url_encode(cjson.encode(payload))
end

-- 检查 Token 是否过期
function _M.is_token_expired(token_data, early_refresh_seconds)
    if not token_data or not token_data.expires_at then
        return true
    end

    local now = ngx.time()
    local expires_at = token_data.expires_at
    local early_refresh = early_refresh_seconds or 300 -- 默认提前5分钟刷新

    return (expires_at - early_refresh) <= now
end

-- 解析 Token 响应
function _M.parse_token_response(response_body)
    local ok, data = pcall(cjson.decode, response_body)
    if not ok then
        return nil, "Invalid JSON response"
    end

    if not data.access_token then
        return nil, "No access_token in response"
    end

    local expires_in = tonumber(data.expires_in) or 3600
    local token_data = {
        access_token = data.access_token,
        token_type = data.token_type or "Bearer",
        expires_in = expires_in,
        expires_at = ngx.time() + expires_in,
        created_at = ngx.time()
    }

    return token_data
end

-- 格式化时间戳
function _M.format_timestamp(timestamp)
    return os.date("%Y-%m-%d %H:%M:%S", timestamp)
end

-- 截断字符串（用于日志）
function _M.truncate_string(str, max_length)
    if not str then
        return "nil"
    end

    max_length = max_length or 50
    if #str <= max_length then
        return str
    end

    return str:sub(1, max_length) .. "...truncated..."
end

-- 验证 JSON 格式
function _M.validate_json(json_str)
    local ok, data = pcall(cjson.decode, json_str)
    return ok, data
end

-- 深拷贝表
function _M.deep_copy(orig)
    local orig_type = type(orig)
    local copy
    if orig_type == 'table' then
        copy = {}
        for orig_key, orig_value in next, orig, nil do
            copy[_M.deep_copy(orig_key)] = _M.deep_copy(orig_value)
        end
        setmetatable(copy, _M.deep_copy(getmetatable(orig)))
    else
        copy = orig
    end
    return copy
end

-- 检查表是否为空
function _M.is_empty_table(t)
    return next(t) == nil
end

-- 安全的字符串连接
function _M.safe_concat(...)
    local args = {...}
    local result = {}

    for i, v in ipairs(args) do
        if v ~= nil then
            table.insert(result, tostring(v))
        end
    end

    return table.concat(result)
end

return _M