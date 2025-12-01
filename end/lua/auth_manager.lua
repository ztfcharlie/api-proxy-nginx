local cjson = require "cjson"
local http = require "resty.http"
local config = require "config"
local utils = require "utils"
local _M = {}

-- 共享内存缓存
local token_cache = ngx.shared.token_cache

-- 使用 RSA 私钥签名 JWT
local function sign_jwt_with_rsa(unsigned_jwt, private_key)
    -- 移除私钥中的头部和尾部标记，只保留 base64 内容
    local key_content = private_key:gsub("%-%-%-%-%-BEGIN[^%-]*%-%-%-%-%-", "")
                                  :gsub("%-%-%-%-%-END[^%-]*%-%-%-%-%-", "")
                                  :gsub("%s+", "")

    -- 使用 OpenSSL 命令行工具进行签名（在容器环境中）
    local temp_key_file = "/tmp/temp_key_" .. ngx.time() .. ".pem"
    local temp_jwt_file = "/tmp/temp_jwt_" .. ngx.time() .. ".txt"

    -- 写入私钥文件
    local key_file = io.open(temp_key_file, "w")
    if not key_file then
        return nil, "Cannot create temporary key file"
    end
    key_file:write(private_key)
    key_file:close()

    -- 写入待签名数据
    local jwt_file = io.open(temp_jwt_file, "w")
    if not jwt_file then
        os.remove(temp_key_file)
        return nil, "Cannot create temporary JWT file"
    end
    jwt_file:write(unsigned_jwt)
    jwt_file:close()

    -- 执行签名
    local cmd = string.format(
        "openssl dgst -sha256 -sign %s %s | openssl base64 -A | tr '+/' '-_' | tr -d '='",
        temp_key_file, temp_jwt_file
    )

    local handle = io.popen(cmd)
    if not handle then
        os.remove(temp_key_file)
        os.remove(temp_jwt_file)
        return nil, "Cannot execute openssl command"
    end

    local signature = handle:read("*a")
    handle:close()

    -- 清理临时文件
    os.remove(temp_key_file)
    os.remove(temp_jwt_file)

    if not signature or signature == "" then
        return nil, "Failed to generate signature"
    end

    -- 移除换行符
    signature = signature:gsub("%s+", "")

    return signature
end

-- 创建 JWT 断言
local function create_jwt_assertion(service_account)
    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[TEST] Creating JWT assertion for service account: ", service_account.client_email)
    end

    -- 创建 JWT header 和 payload
    local header = utils.create_jwt_header()
    local payload = utils.create_jwt_payload(service_account)
    local unsigned_jwt = header .. "." .. payload

    -- 使用私钥签名
    local signature, err = sign_jwt_with_rsa(unsigned_jwt, service_account.private_key)
    if not signature then
        ngx.log(ngx.ERR, "Failed to sign JWT: ", err)
        return nil, err
    end

    local jwt_assertion = unsigned_jwt .. "." .. signature

    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[TEST] JWT assertion created successfully")
    end

    return jwt_assertion
end

-- 获取 OAuth2 Token
local function get_oauth2_token(service_account)
    -- 创建 JWT 断言
    local jwt_assertion, err = create_jwt_assertion(service_account)
    if not jwt_assertion then
        return nil, "Failed to create JWT assertion: " .. (err or "unknown error")
    end

    -- 准备请求参数
    local post_data = {
        grant_type = "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion = jwt_assertion
    }

    -- 编码 POST 数据
    local post_body = {}
    for k, v in pairs(post_data) do
        table.insert(post_body, k .. "=" .. ngx.escape_uri(v))
    end
    post_body = table.concat(post_body, "&")

    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[TEST] Requesting OAuth2 token from: https://oauth2.googleapis.com/token")
    end

    -- 发送 HTTP 请求
    local httpc = http.new()
    httpc:set_timeout(30000) -- 30秒超时

    local res, err = httpc:request_uri("https://oauth2.googleapis.com/token", {
        method = "POST",
        body = post_body,
        headers = {
            ["Content-Type"] = "application/x-www-form-urlencoded",
            ["User-Agent"] = "OpenResty-OAuth2-Client/1.0"
        },
        ssl_verify = true
    })

    if not res then
        ngx.log(ngx.ERR, "HTTP request failed: ", err)
        return nil, "HTTP request failed: " .. (err or "unknown error")
    end

    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[TEST] Token request completed with status: ", res.status)
    end

    if res.status ~= 200 then
        ngx.log(ngx.ERR, "OAuth2 request failed with status: ", res.status, ", body: ", res.body)
        return nil, "OAuth2 request failed with status: " .. res.status
    end

    -- 解析响应
    local token_data, parse_err = utils.parse_token_response(res.body)
    if not token_data then
        ngx.log(ngx.ERR, "Failed to parse token response: ", parse_err)
        return nil, "Failed to parse token response: " .. parse_err
    end

    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[TEST] Received access_token: ", utils.truncate_string(token_data.access_token, 20))
        ngx.log(ngx.INFO, "[TEST] Token expires in: ", token_data.expires_in, " seconds")
    end

    return token_data
end

-- 根据权重选择服务账号文件（支持加权轮询）
local function select_key_file_by_weight(key_files)
    if not key_files or #key_files == 0 then
        return nil
    end

    -- 如果只有一个文件，直接返回
    if #key_files == 1 then
        return key_files[1].key_filename
    end

    -- 计算总权重
    local total_weight = 0
    for _, key_file in ipairs(key_files) do
        total_weight = total_weight + (key_file.key_weight or 1)
    end

    -- 随机选择（基于权重）
    local random_weight = math.random() * total_weight
    local current_weight = 0

    for _, key_file in ipairs(key_files) do
        current_weight = current_weight + (key_file.key_weight or 1)
        if random_weight <= current_weight then
            return key_file.key_filename
        end
    end

    -- 默认返回第一个
    return key_files[1].key_filename
end

-- 选择可用的服务账号文件（支持多个文件轮询和故障转移）
local function select_available_key_file(client_token)
    local key_files, err = config.get_client_key_files(client_token)
    if not key_files then
        return nil, err or "No key files configured"
    end

    -- 如果只有一个文件，直接返回
    if #key_files == 1 then
        return key_files[1].key_filename
    end

    -- 多个文件时，优先选择有效 token 的文件
    for _, key_file in ipairs(key_files) do
        local key_filename = key_file.key_filename
        local cache_key = "token:" .. key_filename
        local cached_token_str = token_cache:get(cache_key)

        if cached_token_str then
            local ok, cached_token = pcall(cjson.decode, cached_token_str)
            if ok and cached_token then
                local app_config = config.get_app_config()
                local early_refresh = app_config and app_config.token_refresh and app_config.token_refresh.early_refresh or 300

                if not utils.is_token_expired(cached_token, early_refresh) then
                    if config.should_test_output("oauth_process") then
                        ngx.log(ngx.INFO, "[TEST] Selected key file with valid token: ", key_filename)
                    end
                    return key_filename
                end
            end
        end
    end

    -- 如果没有有效 token，检查文件缓存
    for _, key_file in ipairs(key_files) do
        local key_filename = key_file.key_filename
        local ok, file_token = pcall(config.read_cached_token, key_filename)
        if ok and file_token then
            local app_config = config.get_app_config()
            local early_refresh = app_config and app_config.token_refresh and app_config.token_refresh.early_refresh or 300

            if not utils.is_token_expired(file_token, early_refresh) then
                if config.should_test_output("oauth_process") then
                    ngx.log(ngx.INFO, "[TEST] Selected key file with valid file cache: ", key_filename)
                end
                return key_filename
            end
        end
    end

    -- 都没有有效 token，根据权重选择
    local selected = select_key_file_by_weight(key_files)
    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[TEST] No valid tokens found, selected by weight: ", selected)
    end
    return selected
end

-- 获取或刷新 Token（Lazy Loading 实现）
local function get_or_refresh_token(client_token, key_filename)
    local cache_key = "token:" .. key_filename

    -- 1. 检查内存缓存
    local cached_token_str = token_cache:get(cache_key)
    if cached_token_str then
        local ok, token_data = pcall(cjson.decode, cached_token_str)
        if ok and token_data then
            local app_config = config.get_app_config()
            local early_refresh = app_config and app_config.token_refresh and app_config.token_refresh.early_refresh or 300

            if not utils.is_token_expired(token_data, early_refresh) then
                if config.should_test_output("oauth_process") then
                    ngx.log(ngx.INFO, "[TEST] Using cached token for: ", key_filename)
                end
                return token_data.access_token, nil
            end
        end
    end

    -- 2. 检查文件缓存
    local file_token = config.read_cached_token(key_filename)
    if file_token then
        local app_config = config.get_app_config()
        local early_refresh = app_config and app_config.token_refresh and app_config.token_refresh.early_refresh or 300

        if not utils.is_token_expired(file_token, early_refresh) then
            -- 更新内存缓存
            token_cache:set(cache_key, cjson.encode(file_token), file_token.expires_in)
            if config.should_test_output("oauth_process") then
                ngx.log(ngx.INFO, "[TEST] Using file cached token for: ", key_filename)
            end
            return file_token.access_token, nil
        end
    end

    -- 3. Lazy Loading: 只有在需要时才获取新 Token
    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[TEST] Token expired or not found, requesting new token for: ", key_filename)
    end

    -- 读取服务账号凭证
    local service_account, err = config.read_service_account(key_filename)
    if not service_account then
        local error_msg = "Cannot read service account: " .. key_filename .. " (may be expired or invalid)"
        ngx.log(ngx.ERR, error_msg, ", error: ", err or "unknown")
        return nil, error_msg
    end

    -- 获取新 Token
    local token_data, token_err = get_oauth2_token(service_account)
    if not token_data then
        local error_msg = "Failed to get OAuth2 token for: " .. key_filename .. " (credential may be expired)"
        ngx.log(ngx.ERR, error_msg, ", error: ", token_err or "unknown")
        return nil, error_msg
    end

    -- 缓存 Token
    local cache_success = token_cache:set(cache_key, cjson.encode(token_data), token_data.expires_in)
    if not cache_success then
        ngx.log(ngx.WARN, "Failed to cache token in memory for: ", key_filename)
    end

    -- 写入文件缓存
    local file_success, file_err = config.write_cached_token(key_filename, token_data)
    if not file_success then
        ngx.log(ngx.WARN, "Failed to cache token in file: ", file_err or "unknown")
    end

    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[TEST] Token acquired and cached for: ", key_filename)
    end

    return token_data.access_token, nil
end

-- 客户端认证（使用新的配置结构）
function _M.authenticate_client()
    -- 提取客户端 Token
    local client_token, err = utils.extract_client_token()
    if not client_token then
        utils.error_response(401, err)
        return nil
    end

    -- 检查客户端状态
    local client_status = config.get_client_status(client_token)
    if not client_status then
        utils.error_response(403, "Client not found")
        return nil
    end

    if client_status ~= "enable" then
        utils.error_response(403, "Client disabled")
        return nil
    end

    -- 选择可用的服务账号文件（支持多个文件和权重）
    local key_filename, select_err = select_available_key_file(client_token)
    if not key_filename then
        utils.error_response(400, "No service account configured: " .. (select_err or "unknown error"))
        return nil
    end

    -- Lazy Loading: 获取或刷新 OAuth2 Token
    local access_token, token_err = get_or_refresh_token(client_token, key_filename)
    if not access_token then
        utils.error_response(500, "Failed to obtain access token: " .. (token_err or "unknown error"))
        return nil
    end

    return client_token, access_token, key_filename
end

-- 获取 API 主机（使用新的配置结构）
function _M.get_api_host(key_filename, model_name)
    if not key_filename or not model_name then
        return nil
    end

    -- 从新配置中获取模型对应的 API 域名
    local api_domain = config.get_model_domain(key_filename, model_name)
    return api_domain
end

-- 预热 Token 功能已移除
-- 采用 Lazy Loading 策略：只在请求时才获取 Token
-- 这样可以避免启动时因过期凭证导致的失败

return _M
