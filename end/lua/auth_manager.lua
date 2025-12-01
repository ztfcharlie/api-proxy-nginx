-- auth_manager.lua - 仅使用curl的OAuth2实现
local cjson = require "cjson"
local oauth2_client = require "oauth2_client"
local config = require "config"
local utils = require "utils"
local _M = {}

-- 共享内存缓存（安全访问）
local token_cache
if ngx and ngx.shared then
    token_cache = ngx.shared.token_cache
end

-- 使用curl获取OAuth2 Token（简化版）
local function get_oauth2_token_simple(service_account)
    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[OAuth2] Starting OAuth2 flow for: ", service_account.client_email)
    end

    -- 1. 创建JWT断言
    local jwt_assertion, jwt_err = oauth2_client.create_jwt_assertion(service_account)
    if not jwt_assertion then
        ngx.log(ngx.ERR, "[OAuth2] Failed to create JWT assertion: ", jwt_err)
        return nil, "Failed to create JWT assertion: " .. (jwt_err or "unknown error")
    end

    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[OAuth2] JWT assertion created successfully")
    end

    -- 2. 使用curl获取token
    local token_data, err = oauth2_client.get_oauth2_token_via_curl(jwt_assertion)
    if not token_data then
        ngx.log(ngx.ERR, "[OAuth2] OAuth2 request failed: ", err)
        return nil, "Failed to get OAuth2 token: " .. (err or "unknown error")
    end

    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[OAuth2] Successfully obtained access token")
        ngx.log(ngx.INFO, "[OAuth2] Token expires in: ", token_data.expires_in, " seconds")
    end

    return token_data
end

-- 获取或刷新Token（简化版）
local function get_or_refresh_token(client_token, key_filename)
    ngx.log(ngx.INFO, "[TOKEN-DEBUG] ===== Starting Token Acquisition Process =====")
    ngx.log(ngx.INFO, "[TOKEN-DEBUG] Client: ", client_token, ", Key file: ", key_filename)

    local cache_key = "token:" .. key_filename

    -- 1. 检查内存缓存
    ngx.log(ngx.INFO, "[TOKEN-DEBUG] Step 1: Checking memory cache")
    local cached_token_str
    if token_cache then
        cached_token_str = token_cache:get(cache_key)
    end
    if cached_token_str then
        ngx.log(ngx.INFO, "[TOKEN-DEBUG] Found cached token in memory")
        local ok, token_data = pcall(cjson.decode, cached_token_str)
        if ok and token_data then
            local app_config = config.get_app_config()
            local early_refresh = app_config and app_config.token_refresh and app_config.token_refresh.early_refresh or 300

            if not utils.is_token_expired(token_data, early_refresh) then
                ngx.log(ngx.INFO, "[TOKEN-DEBUG] Using valid cached token from memory")
                return token_data.access_token, nil
            else
                ngx.log(ngx.INFO, "[TOKEN-DEBUG] Cached token is expired, need to refresh")
            end
        end
    else
        ngx.log(ngx.INFO, "[TOKEN-DEBUG] No token found in memory cache")
    end

    -- 2. 检查文件缓存
    ngx.log(ngx.INFO, "[TOKEN-DEBUG] Step 2: Checking file cache")
    local file_token = config.read_cached_token(key_filename)
    if file_token then
        ngx.log(ngx.INFO, "[TOKEN-DEBUG] Found cached token in file")
        local app_config = config.get_app_config()
        local early_refresh = app_config and app_config.token_refresh and app_config.token_refresh.early_refresh or 300

        if not utils.is_token_expired(file_token, early_refresh) then
            ngx.log(ngx.INFO, "[TOKEN-DEBUG] Using valid cached token from file")
            -- 更新内存缓存
            if token_cache then
                token_cache:set(cache_key, cjson.encode(file_token), file_token.expires_in)
            end
            return file_token.access_token, nil
        else
            ngx.log(ngx.INFO, "[TOKEN-DEBUG] File cached token is expired, need to refresh")
        end
    else
        ngx.log(ngx.INFO, "[TOKEN-DEBUG] No token found in file cache")
    end

    -- 3. 获取新Token
    ngx.log(ngx.INFO, "[TOKEN-DEBUG] Step 3: Requesting new OAuth2 token")
    ngx.log(ngx.INFO, "[TOKEN-DEBUG] Reading service account file: ", key_filename)

    -- 读取服务账号凭证
    local service_account, err = config.read_service_account(key_filename)
    if not service_account then
        local error_msg = "Cannot read service account: " .. key_filename
        ngx.log(ngx.ERR, "[TOKEN-DEBUG] ", error_msg, ", error: ", err or "unknown")
        return nil, error_msg
    end

    ngx.log(ngx.INFO, "[TOKEN-DEBUG] Service account file loaded successfully")
    ngx.log(ngx.INFO, "[TOKEN-DEBUG] Service account details:")
    ngx.log(ngx.INFO, "[TOKEN-DEBUG]   - type: ", service_account.type or "unknown")
    ngx.log(ngx.INFO, "[TOKEN-DEBUG]   - project_id: ", service_account.project_id or "unknown")
    ngx.log(ngx.INFO, "[TOKEN-DEBUG]   - private_key_id: ", service_account.private_key_id or "unknown")
    ngx.log(ngx.INFO, "[TOKEN-DEBUG]   - client_email: ", service_account.client_email or "unknown")
    ngx.log(ngx.INFO, "[TOKEN-DEBUG]   - client_id: ", service_account.client_id or "unknown")
    ngx.log(ngx.INFO, "[TOKEN-DEBUG]   - auth_uri: ", service_account.auth_uri or "unknown")
    ngx.log(ngx.INFO, "[TOKEN-DEBUG]   - token_uri: ", service_account.token_uri or "unknown")

    -- 检查私钥内容（只显示前50个字符）
    if service_account.private_key then
        local key_preview = string.sub(service_account.private_key, 1, 50)
        ngx.log(ngx.INFO, "[TOKEN-DEBUG]   - private_key (first 50 chars): ", key_preview, "...")
        ngx.log(ngx.INFO, "[TOKEN-DEBUG]   - private_key length: ", string.len(service_account.private_key))
    else
        ngx.log(ngx.ERR, "[TOKEN-DEBUG]   - private_key: MISSING!")
    end

    -- 验证服务账号必要字段
    if not service_account.client_email or not service_account.private_key then
        local error_msg = "Invalid service account format: missing client_email or private_key"
        ngx.log(ngx.ERR, "[TOKEN-DEBUG] ", error_msg)
        return nil, error_msg
    end

    -- 获取新Token
    ngx.log(ngx.INFO, "[TOKEN-DEBUG] Step 4: Creating OAuth2 request")
    local token_data, token_err = get_oauth2_token_simple(service_account)
    if not token_data then
        local error_msg = "Failed to get OAuth2 token for: " .. key_filename
        ngx.log(ngx.ERR, "[TOKEN-DEBUG] ", error_msg, ", error: ", token_err or "unknown")
        return nil, error_msg
    end

    -- 缓存Token
    ngx.log(ngx.INFO, "[TOKEN-DEBUG] Step 5: Caching new token")
    if token_cache then
        local cache_success = token_cache:set(cache_key, cjson.encode(token_data), token_data.expires_in)
        if not cache_success then
            ngx.log(ngx.WARN, "[TOKEN-DEBUG] Failed to cache token in memory for: ", key_filename)
        else
            ngx.log(ngx.INFO, "[TOKEN-DEBUG] Token cached in memory successfully")
        end
    end

    -- 写入文件缓存
    local file_success, file_err = config.write_cached_token(key_filename, token_data)
    if not file_success then
        ngx.log(ngx.WARN, "[TOKEN-DEBUG] Failed to cache token in file: ", file_err or "unknown")
    else
        ngx.log(ngx.INFO, "[TOKEN-DEBUG] Token cached in file successfully")
    end

    ngx.log(ngx.INFO, "[TOKEN-DEBUG] ===== Token Acquisition Complete =====")
    return token_data.access_token, nil
end

-- 客户端认证（简化版）
function _M.authenticate_client()
    ngx.log(ngx.INFO, "[AUTH-DEBUG] ===== Starting Client Authentication =====")

    -- 提取客户端Token
    ngx.log(ngx.INFO, "[AUTH-DEBUG] Step 1: Extracting client token from Authorization header")
    local client_token, err = utils.extract_client_token()
    if not client_token then
        ngx.log(ngx.ERR, "[AUTH-DEBUG] Failed to extract client token: ", err or "unknown")
        utils.error_response(401, err)
        return nil
    end
    ngx.log(ngx.INFO, "[AUTH-DEBUG] Client token extracted: ", client_token)

    -- 检查客户端状态
    ngx.log(ngx.INFO, "[AUTH-DEBUG] Step 2: Checking client status in configuration")
    local client_status = config.get_client_status(client_token)
    if not client_status then
        ngx.log(ngx.ERR, "[AUTH-DEBUG] Client not found in configuration: ", client_token)
        utils.error_response(403, "Client not found")
        return nil
    end
    ngx.log(ngx.INFO, "[AUTH-DEBUG] Client status: ", client_status)

    if client_status ~= "enable" then
        ngx.log(ngx.ERR, "[AUTH-DEBUG] Client is disabled: ", client_token)
        utils.error_response(403, "Client disabled")
        return nil
    end

    -- 简化的服务账号选择（使用第一个可用的）
    ngx.log(ngx.INFO, "[AUTH-DEBUG] Step 3: Getting service account files for client")
    local key_files, select_err = config.get_client_key_files(client_token)
    if not key_files or #key_files == 0 then
        ngx.log(ngx.ERR, "[AUTH-DEBUG] No service account configured for client: ", client_token, ", error: ", select_err or "unknown")
        utils.error_response(400, "No service account configured: " .. (select_err or "unknown error"))
        return nil
    end

    local key_filename = key_files[1].key_filename
    ngx.log(ngx.INFO, "[AUTH-DEBUG] Selected service account file: ", key_filename)
    ngx.log(ngx.INFO, "[AUTH-DEBUG] Available key files count: ", #key_files)

    -- 获取或刷新OAuth2 Token
    ngx.log(ngx.INFO, "[AUTH-DEBUG] Step 4: Getting or refreshing OAuth2 token")
    local access_token, token_err = get_or_refresh_token(client_token, key_filename)
    if not access_token then
        ngx.log(ngx.ERR, "[AUTH-DEBUG] Failed to obtain access token: ", token_err or "unknown error")
        utils.error_response(500, "Failed to obtain access token: " .. (token_err or "unknown error"))
        return nil
    end

    ngx.log(ngx.INFO, "[AUTH-DEBUG] Access token obtained successfully")
    ngx.log(ngx.INFO, "[AUTH-DEBUG] Access token length: ", string.len(access_token))
    ngx.log(ngx.INFO, "[AUTH-DEBUG] Access token (first 50 chars): ", string.sub(access_token, 1, 50), "...")
    ngx.log(ngx.INFO, "[AUTH-DEBUG] ===== Client Authentication Complete =====")

    return client_token, access_token, key_filename
end

-- 获取API主机
function _M.get_api_host(key_filename, model_name)
    if not key_filename or not model_name then
        return nil
    end

    local api_domain = config.get_model_domain(key_filename, model_name)
    return api_domain
end

return _M