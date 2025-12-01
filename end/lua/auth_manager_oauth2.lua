-- auth_manager.lua - 真实OAuth2实现版本
local cjson = require "cjson"
local oauth2_client = require "oauth2_client"
local config = require "config"
local utils = require "utils"
local _M = {}

-- 共享内存缓存
local token_cache = ngx.shared.token_cache

-- 获取OAuth2 Token的完整实现
local function get_oauth2_token(service_account)
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

    -- 2. 尝试使用nginx subrequest获取token
    local token_data, err = oauth2_client.get_oauth2_token_via_subrequest(jwt_assertion)

    -- 3. 如果subrequest失败，使用curl作为备用方案
    if not token_data then
        if config.should_test_output("oauth_process") then
            ngx.log(ngx.INFO, "[OAuth2] Subrequest failed, trying curl: ", err)
        end

        token_data, err = oauth2_client.get_oauth2_token_via_curl(jwt_assertion)
    end

    if not token_data then
        ngx.log(ngx.ERR, "[OAuth2] All OAuth2 methods failed: ", err)
        return nil, "Failed to get OAuth2 token: " .. (err or "unknown error")
    end

    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[OAuth2] Successfully obtained access token")
        ngx.log(ngx.INFO, "[OAuth2] Token expires in: ", token_data.expires_in, " seconds")
    end

    return token_data
end

-- 根据权重选择服务账号文件
local function select_key_file_by_weight(key_files)
    if not key_files or #key_files == 0 then
        return nil
    end

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

    return key_files[1].key_filename
end

-- 选择可用的服务账号文件
local function select_available_key_file(client_token)
    local key_files, err = config.get_client_key_files(client_token)
    if not key_files then
        return nil, err or "No key files configured"
    end

    if #key_files == 1 then
        return key_files[1].key_filename
    end

    -- 优先选择有效token的文件
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
                        ngx.log(ngx.INFO, "[OAuth2] Selected key file with valid token: ", key_filename)
                    end
                    return key_filename
                end
            end
        end
    end

    -- 检查文件缓存
    for _, key_file in ipairs(key_files) do
        local key_filename = key_file.key_filename
        local ok, file_token = pcall(config.read_cached_token, key_filename)
        if ok and file_token then
            local app_config = config.get_app_config()
            local early_refresh = app_config and app_config.token_refresh and app_config.token_refresh.early_refresh or 300

            if not utils.is_token_expired(file_token, early_refresh) then
                if config.should_test_output("oauth_process") then
                    ngx.log(ngx.INFO, "[OAuth2] Selected key file with valid file cache: ", key_filename)
                end
                return key_filename
            end
        end
    end

    -- 根据权重选择
    local selected = select_key_file_by_weight(key_files)
    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[OAuth2] No valid tokens found, selected by weight: ", selected)
    end
    return selected
end

-- 获取或刷新Token
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
                    ngx.log(ngx.INFO, "[OAuth2] Using cached token for: ", key_filename)
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
                ngx.log(ngx.INFO, "[OAuth2] Using file cached token for: ", key_filename)
            end
            return file_token.access_token, nil
        end
    end

    -- 3. 获取新Token
    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[OAuth2] Token expired or not found, requesting new token for: ", key_filename)
    end

    -- 读取服务账号凭证
    local service_account, err = config.read_service_account(key_filename)
    if not service_account then
        local error_msg = "Cannot read service account: " .. key_filename
        ngx.log(ngx.ERR, "[OAuth2] ", error_msg, ", error: ", err or "unknown")
        return nil, error_msg
    end

    -- 验证服务账号必要字段
    if not service_account.client_email or not service_account.private_key then
        local error_msg = "Invalid service account format: missing client_email or private_key"
        ngx.log(ngx.ERR, "[OAuth2] ", error_msg)
        return nil, error_msg
    end

    -- 获取新Token
    local token_data, token_err = get_oauth2_token(service_account)
    if not token_data then
        local error_msg = "Failed to get OAuth2 token for: " .. key_filename
        ngx.log(ngx.ERR, "[OAuth2] ", error_msg, ", error: ", token_err or "unknown")
        return nil, error_msg
    end

    -- 缓存Token
    local cache_success = token_cache:set(cache_key, cjson.encode(token_data), token_data.expires_in)
    if not cache_success then
        ngx.log(ngx.WARN, "[OAuth2] Failed to cache token in memory for: ", key_filename)
    end

    -- 写入文件缓存
    local file_success, file_err = config.write_cached_token(key_filename, token_data)
    if not file_success then
        ngx.log(ngx.WARN, "[OAuth2] Failed to cache token in file: ", file_err or "unknown")
    end

    if config.should_test_output("oauth_process") then
        ngx.log(ngx.INFO, "[OAuth2] Token acquired and cached for: ", key_filename)
    end

    return token_data.access_token, nil
end

-- 客户端认证
function _M.authenticate_client()
    -- 提取客户端Token
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

    -- 选择可用的服务账号文件
    local key_filename, select_err = select_available_key_file(client_token)
    if not key_filename then
        utils.error_response(400, "No service account configured: " .. (select_err or "unknown error"))
        return nil
    end

    -- 获取或刷新OAuth2 Token
    local access_token, token_err = get_or_refresh_token(client_token, key_filename)
    if not access_token then
        utils.error_response(500, "Failed to obtain access token: " .. (token_err or "unknown error"))
        return nil
    end

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