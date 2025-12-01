-- OAuth2客户端实现 - 使用nginx内置功能
local cjson = require "cjson"
local _M = {}

-- 创建JWT Header
local function create_jwt_header()
    local header = {
        alg = "RS256",
        typ = "JWT"
    }
    return ngx.encode_base64(cjson.encode(header)):gsub('+', '-'):gsub('/', '_'):gsub('=', '')
end

-- 创建JWT Payload
local function create_jwt_payload(service_account)
    local now = ngx.time()
    local payload = {
        iss = service_account.client_email,
        scope = "https://www.googleapis.com/auth/cloud-platform",
        aud = "https://oauth2.googleapis.com/token",
        exp = now + 3600, -- 1小时后过期
        iat = now
    }
    return ngx.encode_base64(cjson.encode(payload)):gsub('+', '-'):gsub('/', '_'):gsub('=', '')
end

-- 使用OpenSSL命令行工具签名JWT
local function sign_jwt_with_openssl(unsigned_jwt, private_key)
    -- 创建临时文件
    local temp_key_file = "/tmp/jwt_key_" .. ngx.worker.pid() .. "_" .. ngx.time() .. ".pem"
    local temp_data_file = "/tmp/jwt_data_" .. ngx.worker.pid() .. "_" .. ngx.time() .. ".txt"

    -- 写入私钥
    local key_file = io.open(temp_key_file, "w")
    if not key_file then
        return nil, "Cannot create temporary key file"
    end
    key_file:write(private_key)
    key_file:close()

    -- 写入待签名数据
    local data_file = io.open(temp_data_file, "w")
    if not data_file then
        os.remove(temp_key_file)
        return nil, "Cannot create temporary data file"
    end
    data_file:write(unsigned_jwt)
    data_file:close()

    -- 执行签名
    local cmd = string.format(
        "openssl dgst -sha256 -sign %s %s | openssl base64 -A | tr '+/' '-_' | tr -d '='",
        temp_key_file, temp_data_file
    )

    local handle = io.popen(cmd)
    if not handle then
        os.remove(temp_key_file)
        os.remove(temp_data_file)
        return nil, "Cannot execute openssl command"
    end

    local signature = handle:read("*a")
    handle:close()

    -- 清理临时文件
    os.remove(temp_key_file)
    os.remove(temp_data_file)

    if not signature or signature == "" then
        return nil, "Failed to generate signature"
    end

    -- 移除换行符
    signature = signature:gsub("%s+", "")
    return signature
end

-- 创建JWT断言
function _M.create_jwt_assertion(service_account)
    local header = create_jwt_header()
    local payload = create_jwt_payload(service_account)
    local unsigned_jwt = header .. "." .. payload

    local signature, err = sign_jwt_with_openssl(unsigned_jwt, service_account.private_key)
    if not signature then
        return nil, err
    end

    return unsigned_jwt .. "." .. signature
end

-- 使用nginx subrequest获取OAuth2 token
function _M.get_oauth2_token_via_subrequest(jwt_assertion)
    -- 准备POST数据
    local post_data = "grant_type=" .. ngx.escape_uri("urn:ietf:params:oauth:grant-type:jwt-bearer") ..
                     "&assertion=" .. ngx.escape_uri(jwt_assertion)

    -- 设置请求体
    ngx.req.set_body_data(post_data)

    -- 使用nginx的proxy_pass功能
    -- 这需要在nginx配置中添加一个内部location
    local res = ngx.location.capture("/internal/oauth2", {
        method = ngx.HTTP_POST,
        body = post_data,
        vars = {
            oauth2_target = "https://oauth2.googleapis.com/token"
        }
    })

    if res.status ~= 200 then
        return nil, "OAuth2 request failed with status: " .. res.status
    end

    local ok, token_data = pcall(cjson.decode, res.body)
    if not ok then
        return nil, "Failed to parse OAuth2 response"
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

-- 使用curl命令获取OAuth2 token（备用方案）
function _M.get_oauth2_token_via_curl(jwt_assertion)
    -- 准备POST数据
    local post_data = "grant_type=" .. ngx.escape_uri("urn:ietf:params:oauth:grant-type:jwt-bearer") ..
                     "&assertion=" .. ngx.escape_uri(jwt_assertion)

    -- 记录OAuth2请求详细信息
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] ===== OAuth2 Request Details =====")
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] Target URL: https://oauth2.googleapis.com/token")
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] Method: POST")
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] Headers:")
    ngx.log(ngx.INFO, "[OAuth2-DEBUG]   Content-Type: application/x-www-form-urlencoded")
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] POST Data Length: ", string.len(post_data))
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] Grant Type: urn:ietf:params:oauth:grant-type:jwt-bearer")
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] JWT Assertion Length: ", string.len(jwt_assertion))
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] JWT Assertion (first 100 chars): ", string.sub(jwt_assertion, 1, 100), "...")

    -- 创建临时文件存储响应
    local temp_response_file = "/tmp/oauth2_response_" .. ngx.worker.pid() .. "_" .. ngx.time() .. ".json"

    -- 使用curl发送请求（添加详细输出）
    local cmd = string.format(
        "curl -v -X POST 'https://oauth2.googleapis.com/token' " ..
        "-H 'Content-Type: application/x-www-form-urlencoded' " ..
        "-d '%s' -o %s -w '%%{http_code}' 2>&1",
        post_data, temp_response_file
    )

    ngx.log(ngx.INFO, "[OAuth2-DEBUG] Executing curl command...")

    local handle = io.popen(cmd)
    if not handle then
        ngx.log(ngx.ERR, "[OAuth2-DEBUG] Cannot execute curl command")
        return nil, "Cannot execute curl command"
    end

    local curl_output = handle:read("*a")
    handle:close()

    -- 记录curl的详细输出
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] ===== Curl Output =====")
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] Full curl output: ", curl_output)

    -- 提取HTTP状态码（curl输出的最后一行）
    local http_code = string.match(curl_output, "(%d+)$")
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] HTTP Status Code: ", http_code or "unknown")

    -- 检查HTTP状态码
    if http_code ~= "200" then
        ngx.log(ngx.ERR, "[OAuth2-DEBUG] OAuth2 request failed with HTTP ", http_code or "unknown")
        os.remove(temp_response_file)
        return nil, "OAuth2 request failed with HTTP " .. (http_code or "unknown")
    end

    -- 读取响应
    local response_file = io.open(temp_response_file, "r")
    if not response_file then
        ngx.log(ngx.ERR, "[OAuth2-DEBUG] Cannot read response file: ", temp_response_file)
        os.remove(temp_response_file)
        return nil, "Cannot read response file"
    end

    local response_body = response_file:read("*a")
    response_file:close()
    os.remove(temp_response_file)

    -- 记录响应详细信息
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] ===== OAuth2 Response =====")
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] Response Body Length: ", string.len(response_body or ""))
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] Response Body: ", response_body or "empty")

    -- 解析JSON响应
    local ok, token_data = pcall(cjson.decode, response_body)
    if not ok then
        ngx.log(ngx.ERR, "[OAuth2-DEBUG] Failed to parse JSON response: ", tostring(token_data))
        ngx.log(ngx.ERR, "[OAuth2-DEBUG] Raw response was: ", response_body or "empty")
        return nil, "Failed to parse OAuth2 response: " .. tostring(token_data)
    end

    ngx.log(ngx.INFO, "[OAuth2-DEBUG] JSON parsing successful")

    if not token_data.access_token then
        ngx.log(ngx.ERR, "[OAuth2-DEBUG] No access_token in response")
        -- 记录可用字段
        local fields = {}
        for k, v in pairs(token_data or {}) do
            table.insert(fields, k)
        end
        ngx.log(ngx.ERR, "[OAuth2-DEBUG] Available fields: ", table.concat(fields, ", "))
        return nil, "No access_token in response"
    end

    ngx.log(ngx.INFO, "[OAuth2-DEBUG] Access token obtained successfully")
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] Token type: ", token_data.token_type or "unknown")
    ngx.log(ngx.INFO, "[OAuth2-DEBUG] Expires in: ", token_data.expires_in or "unknown", " seconds")

    -- 添加过期时间
    local expires_in = tonumber(token_data.expires_in) or 3600
    token_data.expires_at = ngx.time() + expires_in
    token_data.created_at = ngx.time()

    return token_data
end

return _M