-- OAuth2 多供应商支持模块
local cjson = require "cjson"
local _M = {}

-- OAuth2 供应商配置
local providers = {
    google = {
        name = "Google Cloud",
        token_url = "https://oauth2.googleapis.com/token",
        scope = "https://www.googleapis.com/auth/cloud-platform",
        grant_type = "urn:ietf:params:oauth:grant-type:jwt-bearer",
        token_expires = 3600,

        -- JWT配置
        jwt_algorithm = "RS256",
        jwt_type = "JWT",

        -- 创建JWT payload的函数
        create_payload = function(service_account, now)
            return {
                iss = service_account.client_email,
                scope = "https://www.googleapis.com/auth/cloud-platform",
                aud = "https://oauth2.googleapis.com/token",
                exp = now + 3600,
                iat = now
            }
        end
    },

    azure = {
        name = "Microsoft Azure",
        token_url = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
        scope = "https://cognitiveservices.azure.com/.default",
        grant_type = "client_credentials",
        token_expires = 3600,

        -- Azure使用不同的认证方式
        create_payload = function(service_account, now)
            return {
                client_id = service_account.client_id,
                client_secret = service_account.client_secret,
                scope = "https://cognitiveservices.azure.com/.default",
                grant_type = "client_credentials"
            }
        end
    },

    aws = {
        name = "Amazon Web Services",
        token_url = "https://sts.amazonaws.com/",
        scope = "",
        grant_type = "aws4_request",
        token_expires = 3600,

        -- AWS使用签名版本4
        create_payload = function(service_account, now)
            return {
                access_key_id = service_account.access_key_id,
                secret_access_key = service_account.secret_access_key,
                region = service_account.region or "us-east-1",
                service = "bedrock"
            }
        end
    },

    anthropic = {
        name = "Anthropic",
        token_url = "", -- Anthropic使用API Key，不需要OAuth2
        scope = "",
        grant_type = "api_key",
        token_expires = 0, -- API Key不过期

        create_payload = function(service_account, now)
            return {
                api_key = service_account.api_key
            }
        end
    }
}

-- 根据服务类型获取供应商配置
function _M.get_provider_config(service_type)
    return providers[service_type]
end

-- 获取所有支持的供应商
function _M.get_supported_providers()
    local supported = {}
    for provider_name, config in pairs(providers) do
        table.insert(supported, {
            name = provider_name,
            display_name = config.name,
            requires_oauth2 = config.grant_type ~= "api_key"
        })
    end
    return supported
end

-- 根据客户端token推断服务类型
function _M.detect_service_type(client_token)
    if not client_token then
        return nil
    end

    -- 根据前缀推断服务类型
    local prefixes = {
        ["gemini%-"] = "google",
        ["google%-"] = "google",
        ["azure%-"] = "azure",
        ["openai%-"] = "azure", -- OpenAI通过Azure提供
        ["aws%-"] = "aws",
        ["bedrock%-"] = "aws",
        ["anthropic%-"] = "anthropic",
        ["claude%-"] = "anthropic"
    }

    for prefix, service_type in pairs(prefixes) do
        if client_token:match("^" .. prefix) then
            return service_type
        end
    end

    -- 默认返回google（向后兼容）
    return "google"
end

-- 创建供应商特定的OAuth2请求
function _M.create_oauth2_request(provider_config, service_account)
    local now = ngx.time()

    if provider_config.grant_type == "api_key" then
        -- API Key类型，直接返回
        return {
            access_token = service_account.api_key,
            token_type = "Bearer",
            expires_in = 0,
            expires_at = 0,
            created_at = now
        }
    elseif provider_config.grant_type == "client_credentials" then
        -- Azure类型的client credentials
        local payload = provider_config.create_payload(service_account, now)
        local post_data = {}
        for k, v in pairs(payload) do
            table.insert(post_data, k .. "=" .. ngx.escape_uri(tostring(v)))
        end

        return {
            url = provider_config.token_url:gsub("{tenant_id}", service_account.tenant_id or "common"),
            method = "POST",
            headers = {
                ["Content-Type"] = "application/x-www-form-urlencoded",
                ["User-Agent"] = "OpenResty-OAuth2-Client/1.0"
            },
            body = table.concat(post_data, "&")
        }
    elseif provider_config.grant_type == "urn:ietf:params:oauth:grant-type:jwt-bearer" then
        -- Google类型的JWT Bearer
        local oauth2_client = require "oauth2_client"
        local jwt_assertion, err = oauth2_client.create_jwt_assertion(service_account)
        if not jwt_assertion then
            return nil, err
        end

        local post_data = "grant_type=" .. ngx.escape_uri(provider_config.grant_type) ..
                         "&assertion=" .. ngx.escape_uri(jwt_assertion)

        return {
            url = provider_config.token_url,
            method = "POST",
            headers = {
                ["Content-Type"] = "application/x-www-form-urlencoded",
                ["User-Agent"] = "OpenResty-OAuth2-Client/1.0"
            },
            body = post_data
        }
    else
        return nil, "Unsupported grant type: " .. provider_config.grant_type
    end
end

-- 执行OAuth2请求
function _M.execute_oauth2_request(request_config)
    if request_config.access_token then
        -- 直接返回API Key类型的token
        return request_config
    end

    -- 使用curl执行HTTP请求
    local temp_response_file = "/tmp/oauth2_response_" .. ngx.worker.pid() .. "_" .. ngx.time() .. ".json"

    -- 构建curl命令
    local headers = {}
    for k, v in pairs(request_config.headers or {}) do
        table.insert(headers, "-H '" .. k .. ": " .. v .. "'")
    end

    local cmd = string.format(
        "curl -s -X %s '%s' %s -d '%s' -o %s -w '%%{http_code}'",
        request_config.method,
        request_config.url,
        table.concat(headers, " "),
        request_config.body or "",
        temp_response_file
    )

    local handle = io.popen(cmd)
    if not handle then
        return nil, "Cannot execute curl command"
    end

    local http_code = handle:read("*a")
    handle:close()

    -- 检查HTTP状态码
    if http_code ~= "200" then
        os.remove(temp_response_file)
        return nil, "OAuth2 request failed with HTTP " .. http_code
    end

    -- 读取响应
    local response_file = io.open(temp_response_file, "r")
    if not response_file then
        os.remove(temp_response_file)
        return nil, "Cannot read response file"
    end

    local response_body = response_file:read("*a")
    response_file:close()
    os.remove(temp_response_file)

    -- 解析JSON响应
    local ok, token_data = pcall(cjson.decode, response_body)
    if not ok then
        return nil, "Failed to parse OAuth2 response: " .. tostring(token_data)
    end

    if not token_data.access_token then
        return nil, "No access_token in response"
    end

    -- 添加过期时间
    local expires_in = tonumber(token_data.expires_in) or 3600
    token_data.expires_at = ngx.time() + expires_in
    token_data.created_at = ngx.time()

    return token_data
end

return _M