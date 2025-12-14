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
    
    local error_body = cjson.encode({
        error = message,
        status = status,
        timestamp = ngx.time(),
        request_id = ngx.var.request_id
    })
    
    -- [关键] 记录错误响应体到上下文，供 log_request 使用
    ngx.ctx.buffered_response = error_body
    
    -- 尝试记录日志 (异步)
    _M.log_request()
    
    ngx.say(error_body)
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

    -- [Added] 智能伪装 User-Agent
    local api_host = ngx.var.api_host or ""
    local fake_ua = "python-requests/2.31.0" -- 默认通用 UA

    if string.find(api_host, "googleapis.com") then
        -- Google Vertex AI
        fake_ua = "google-cloud-aiplatform/1.38.1 proto/1.0.0 grpc/1.60.0 python/3.10.12"
    elseif string.find(api_host, "openai.com") or string.find(api_host, "azure.com") then
        -- OpenAI / Azure OpenAI
        fake_ua = "openai-python/1.12.0"
    elseif string.find(api_host, "anthropic.com") then
        -- Anthropic Claude
        fake_ua = "anthropic-python/0.18.1"
    end

    ngx.req.set_header("User-Agent", fake_ua)

    if config.should_test_output("upstream_headers") then
        ngx.log(ngx.INFO, "[TEST] Removed privacy headers and set fake UA: ", fake_ua)
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
    -- 1. 在主线程捕获所有需要的变量 (Timer 中无法访问 ngx.var)
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
        ip = ngx.var.remote_addr,
        user_agent = ngx.var.http_user_agent,
        content_type = ngx.var.content_type, -- [Added] for multipart parsing
        request_id = ngx.var.my_request_id or ngx.var.request_id,
        internal_poll = ngx.req.get_headers()["X-Internal-Poll"],
        is_poll = ngx.ctx.is_poll -- [Added] Flag from auth_manager
    }

    -- Request Body
    local req_body = ngx.req.get_body_data()
    if not req_body then
        local req_file = ngx.req.get_body_file()
        if req_file then 
            -- [Fix] Read file content immediately from temp file
            local file = io.open(req_file, "rb")
            if file then
                -- Read up to 50MB (matching client_max_body_size)
                req_body = file:read(50 * 1024 * 1024)
                file:close()
            else
                req_body = "[FILE READ ERROR]: " .. req_file
            end
        else 
            req_body = "" 
        end
    end
    
    if not req_body then req_body = "" end

    -- Response Body (from ctx)
    local res_body = ngx.ctx.buffered_response or ""

    -- 2. 启动异步定时器执行 Redis 操作
    local ok, err = ngx.timer.at(0, function(premature)
        if premature then return end
        
        local red, err = get_redis_connection()
        if not red then
            ngx.log(ngx.ERR, "[LOG] Failed to connect to Redis: ", err)
            return
        end
        
        -- [DEBUG] Confirm Redis Connection Details
        -- Unfortunately red object doesn't expose host/port directly easily, but we can verify DB
        -- Or just log what config thinks it is
        -- ngx.log(ngx.ERR, "[DEBUG-STREAM] Redis Connected. DB: ", config.get_redis_config().db)

        -- 截断
        if #req_body > 10000000 then req_body = string.sub(req_body, 1, 10000000) .. "..." end
        if #res_body > 10000000 then res_body = string.sub(res_body, 1, 10000000) .. "..." end

        -- 429 计数
        if metadata.status == 429 then
            local token_prefix = string.sub(metadata.client_token or "unknown", 1, 10)
            red:incr("alert:429:token:" .. token_prefix)
            red:expire("alert:429:token:" .. token_prefix, 3600)
        end

        -- XADD
        local res, err = red:xadd("stream:api_logs", "MAXLEN", "~", "100000", "*",
            "req_id", metadata.request_id,
            "ts", ngx.time(),
            "meta", cjson.encode(metadata),
            "req_body", req_body,
            "res_body", res_body
        )

        if not res then
            ngx.log(ngx.ERR, "[LOG] Failed to XADD: ", err)
        end

        -- [Added] Also Publish to Live Logs (Pub/Sub)
        local safe_meta = {
            model = metadata.model_name,
            ip = metadata.ip,
            ua = metadata.user_agent,
            token = string.sub(metadata.client_token or "", 1, 10) .. "..."
        }

        local ok_encode, live_payload = pcall(cjson.encode, {
            ts = os.date("!%Y-%m-%dT%H:%M:%S.000Z"),
            source = "nginx-access",
            level = "info",
            msg = string.format("%s %s -> %s (%d) [%sms]", 
                metadata.method, metadata.uri, metadata.upstream_status or "-", metadata.status, metadata.request_time),
            meta = safe_meta
        })

        if ok_encode then
            local sub_count, pub_err = red:publish("sys:log_stream", live_payload)
            if not sub_count then
                ngx.log(ngx.ERR, "[LOG] Redis publish error: ", pub_err)
            end
        else
            ngx.log(ngx.ERR, "[LOG] Failed to encode live payload: ", live_payload)
        end

        red:set_keepalive(10000, 10)
    end)

    if not ok then
        ngx.log(ngx.ERR, "[LOG] Failed to create timer: ", err)
    end
end

-- [Debug] 实时调试日志推送到前端 (Pub/Sub)
function _M.publish_debug_log(level, msg)
    -- Also log to stderr for backup visibility
    if level == "error" or level == "warn" then
        ngx.log(ngx.ERR, "[DEBUG-STREAM] ", msg)
    else
        ngx.log(ngx.INFO, "[DEBUG-STREAM] ", msg)
    end

    if os.getenv("ENABLE_DEBUG_STREAM") ~= "true" then return end
    
    local ok, err = pcall(function()
        local red, err = get_redis_connection()
        if not red then 
            ngx.log(ngx.ERR, "[DEBUG-STREAM] Redis connect failed: ", err)
            return 
        end
        
        local payload = cjson.encode({
            ts = os.date("%Y-%m-%dT%H:%M:%S.000Z"),
            source = "nginx-lua",
            level = level,
            msg = msg,
            req_id = ngx.var.my_request_id or "unknown"
        })
        
        local res, pub_err = red:publish("sys:log_stream", payload)
        if not res then
            ngx.log(ngx.ERR, "[DEBUG-STREAM] Redis publish failed: ", pub_err)
        elseif res == 0 then
            ngx.log(ngx.ERR, "[DEBUG-STREAM] Published to 0 subscribers! Node.js is not listening!")
        else
            -- ngx.log(ngx.ERR, "[DEBUG-STREAM] Successfully published to " .. res .. " subscribers")
        end

        red:set_keepalive(10000, 10)
    end)
end

-- 提取模型名称 (支持 Vertex URL 和 OpenAI Body)
function _M.extract_model_name(uri)
    -- 1. 尝试从 Vertex URL 提取
    local model_name = uri:match("/models/([^/:]+)")
    if model_name then return model_name end

    -- 2. 尝试从 Request Body 提取 (OpenAI Style)
    ngx.req.read_body()
    local body_data = ngx.req.get_body_data()

    -- 辅助函数：正则匹配
    local function find_model(text)
        -- 1. JSON Format
        local m = text:match('"model"%s*:%s*"([^"]+)"')
        if m then return m end
        
        -- 2. Multipart Format
        -- Robust match for model name (alphanumeric, dot, dash)
        m = text:match('name="model".-[\r\n]+([%w%.%-]+)')
        if m then return m end
        
        return nil
    end

    if body_data then
        local m = find_model(body_data)
        if m then return m end
    else
        local body_file = ngx.req.get_body_file()
        if body_file then
            local file, err = io.open(body_file, "r")
            if file then
                local chunk_size = 4096
                local buffer = ""
                local overlap = 128 -- 跨边界缓冲区大小

                while true do
                    local chunk = file:read(chunk_size)
                    if not chunk then break end
                    
                    local data_to_scan = buffer .. chunk
                    local m = find_model(data_to_scan)
                    if m then
                        file:close()
                        return m
                    end

                    -- 准备下一次迭代的缓冲区：保留当前块的最后部分
                    if #chunk >= overlap then
                        buffer = string.sub(chunk, -overlap)
                    else
                        buffer = buffer .. chunk -- 如果块太小，全保留
                    end
                end
                file:close()
            end
        end
    end
    
    -- [Added] Sora Remix Fallback
    -- /v1/videos/{id}/remix -> default to sora-2 if no model found in body
    if uri:match("/v1/videos/.+/remix") then
        return "sora-2"
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