local cjson = require "cjson"
local config = require "config"
local _M = {}

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

    -- [Added] 智能伪装 User-Agent (Updated to 2024 versions)
    local api_host = ngx.var.api_host or ""
    local fake_ua = "python-requests/2.31.0" -- 默认通用 UA

    if string.find(api_host, "googleapis.com") then
        -- Google Vertex AI (SDK v1.43.0)
        fake_ua = "google-cloud-aiplatform/1.43.0 proto/1.0.0 grpc/1.62.0 python/3.11.0"
    elseif string.find(api_host, "openai.com") or string.find(api_host, "azure.com") then
        -- OpenAI / Azure OpenAI (SDK v1.14.0)
        fake_ua = "OpenAI/Python 1.14.0"
    elseif string.find(api_host, "anthropic.com") then
        -- Anthropic Claude (SDK v0.20.0)
        fake_ua = "anthropic-python/0.20.0"
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

-- 记录请求日志
function _M.log_request()
    local app_config = config.get_app_config()

    if config.should_log("info") then
        local log_data = {
            request_id = ngx.var.request_id,
            client_token = ngx.var.client_token,
            key_filename = ngx.var.key_filename,
            model_name = ngx.var.model_name,
            api_host = ngx.var.api_host,
            method = ngx.var.request_method,
            uri = ngx.var.request_uri,
            status = ngx.status,
            request_time = ngx.var.request_time,
            upstream_status = ngx.var.upstream_status,
            upstream_response_time = ngx.var.upstream_response_time
        }

        ngx.log(ngx.INFO, "[REQUEST] ", cjson.encode(log_data))
    end
end

-- 提取模型名称从 URL
function _M.extract_model_name(uri)
    -- 匹配 URL 模式: /v1/projects/{project}/locations/{location}/publishers/google/models/{model}:{operation}
    local model_name = uri:match("/models/([^/:]+)")

    if config.should_test_output("request_headers") then
        ngx.log(ngx.INFO, "[TEST] Extracted model name: ", model_name or "nil", " from URL: ", uri)
    end

    return model_name
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