-- OAuth2 Manager for Google Service Account Authentication
local http = require "resty.http"
local cjson = require "cjson"
local jwt = require "resty.jwt"
local config = require "config"

local _M = {}

-- 缓存的令牌信息
local token_cache = {
    access_token = nil,
    expires_at = 0
}

-- 从 JSON 文件或配置中获取服务账号信息
function _M.get_service_account()
    local service_account_config = config.service_account

    -- 尝试从 JSON 文件读取
    if service_account_config.json_file then
        local file = io.open(service_account_config.json_file, "r")
        if file then
            local content = file:read("*all")
            file:close()

            if content and content ~= "" then
                local success, json_data = pcall(cjson.decode, content)
                if success and json_data then
                    ngx.log(ngx.INFO, "Loaded service account from JSON file: " .. service_account_config.json_file)
                    return {
                        client_email = json_data.client_email,
                        private_key = json_data.private_key,
                        project_id = json_data.project_id
                    }
                else
                    ngx.log(ngx.ERR, "Failed to parse service account JSON file: " .. service_account_config.json_file)
                end
            end
        else
            ngx.log(ngx.WARN, "Service account JSON file not found: " .. service_account_config.json_file)
        end
    end

    -- 回退到环境变量配置
    ngx.log(ngx.INFO, "Using service account from environment variables")
    return {
        client_email = service_account_config.client_email,
        private_key = service_account_config.private_key,
        project_id = service_account_config.project_id
    }
end

-- 生成 JWT 断言
function _M.create_jwt_assertion(service_account)
    local now = ngx.time()

    -- JWT Header
    local jwt_header = {
        alg = "RS256",
        typ = "JWT"
    }

    -- JWT Claims
    local jwt_claims = {
        iss = service_account.client_email,
        scope = "https://www.googleapis.com/auth/generative-language",
        aud = "https://oauth2.googleapis.com/token",
        exp = now + 3600,  -- 1 hour
        iat = now
    }

    -- 签名 JWT
    local jwt_token = jwt:sign(
        service_account.private_key,
        {
            header = jwt_header,
            payload = jwt_claims
        }
    )

    return jwt_token
end

-- 获取 OAuth2 访问令牌
function _M.get_access_token()
    local now = ngx.time()

    -- 检查缓存的令牌是否仍然有效（提前60秒刷新）
    if token_cache.access_token and token_cache.expires_at > now + 60 then
        ngx.log(ngx.INFO, "Using cached OAuth2 token")
        return token_cache.access_token
    end

    ngx.log(ngx.INFO, "Requesting new OAuth2 token")

    -- 获取服务账号信息
    local service_account = _M.get_service_account()
    if not service_account or not service_account.client_email or not service_account.private_key then
        ngx.log(ngx.ERR, "Service account configuration is missing or invalid")
        return nil
    end

    -- 创建 JWT 断言
    local jwt_assertion = _M.create_jwt_assertion(service_account)
    if not jwt_assertion then
        ngx.log(ngx.ERR, "Failed to create JWT assertion")
        return nil
    end

    -- 创建 HTTP 客户端
    local httpc = http.new()
    httpc:set_timeout(10000)  -- 10 seconds timeout

    -- 请求访问令牌
    local res, err = httpc:request_uri("https://oauth2.googleapis.com/token", {
        method = "POST",
        headers = {
            ["Content-Type"] = "application/x-www-form-urlencoded"
        },
        body = ngx.encode_args({
            grant_type = "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion = jwt_assertion
        })
    })

    -- 关闭连接
    httpc:close()

    if not res then
        ngx.log(ngx.ERR, "Failed to request OAuth token: ", err)
        return nil
    end

    if res.status ~= 200 then
        ngx.log(ngx.ERR, "OAuth token request failed with status: ", res.status, " body: ", res.body or "no body")
        return nil
    end

    -- 解析响应
    local success, data = pcall(cjson.decode, res.body)
    if not success then
        ngx.log(ngx.ERR, "Failed to parse OAuth token response: ", res.body)
        return nil
    end

    if not data.access_token then
        ngx.log(ngx.ERR, "No access token in response: ", res.body)
        return nil
    end

    -- 缓存令牌
    token_cache.access_token = data.access_token
    token_cache.expires_at = now + (data.expires_in or 3600) - 60  -- 提前60秒过期

    ngx.log(ngx.INFO, "Successfully obtained OAuth2 token, expires in: ", data.expires_in or 3600, " seconds")

    return data.access_token
end

-- 清除缓存的令牌
function _M.clear_token_cache()
    token_cache.access_token = nil
    token_cache.expires_at = 0
    ngx.log(ngx.INFO, "OAuth2 token cache cleared")
end

-- 检查服务账号配置是否有效
function _M.validate_service_account()
    local service_account = _M.get_service_account()

    if not service_account then
        return false, "Service account configuration is missing"
    end

    if not service_account.client_email then
        return false, "Service account client_email is missing"
    end

    if not service_account.private_key then
        return false, "Service account private_key is missing"
    end

    if not service_account.project_id then
        return false, "Service account project_id is missing"
    end

    return true, "Service account configuration is valid"
end

return _M