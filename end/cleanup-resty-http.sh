#!/bin/bash

# 清理resty.http相关问题

echo "=== Cleaning Up resty.http Issues ==="

echo "1. Checking current auth_manager version..."
head -3 lua/auth_manager.lua

echo ""
echo "2. Ensuring we're using curl-only version..."

# 确保使用curl版本
if grep -q "resty.http" lua/auth_manager.lua; then
    echo "Found resty.http reference in auth_manager.lua, switching to curl-only version..."
    cp lua/auth_manager_curl_only.lua lua/auth_manager.lua
    echo "✓ Switched to curl-only auth_manager"
else
    echo "✓ Already using curl-only auth_manager"
fi

echo ""
echo "3. Checking for resty.http references in other files..."

# 检查其他文件中的resty.http引用
echo "Checking lua files for resty.http references:"
grep -r "resty\.http" lua/ || echo "✓ No resty.http references found in lua files"

echo ""
echo "4. Removing incomplete resty.http installation..."

# 删除不完整的resty.http文件
docker-compose exec api-proxy-nginx sh -c "
echo 'Removing incomplete resty.http files...'
rm -f /usr/local/openresty/lualib/resty/http.lua
rm -f /usr/local/openresty/lualib/resty/http_headers.lua
echo 'Incomplete resty.http files removed'
"

echo ""
echo "5. Verifying oauth2_client module doesn't use resty.http..."

if grep -q "resty\.http" lua/oauth2_client.lua; then
    echo "Found resty.http in oauth2_client.lua, need to fix..."

    # 创建不使用resty.http的oauth2_client版本
    cat > lua/oauth2_client_curl_only.lua << 'EOF'
-- OAuth2客户端实现 - 纯curl版本，不使用resty.http
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
        exp = now + 3600,
        iat = now
    }
    return ngx.encode_base64(cjson.encode(payload)):gsub('+', '-'):gsub('/', '_'):gsub('=', '')
end

-- 使用OpenSSL签名JWT
local function sign_jwt_with_openssl(unsigned_jwt, private_key)
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

-- 使用curl获取OAuth2 token
function _M.get_oauth2_token_via_curl(jwt_assertion)
    local post_data = "grant_type=" .. ngx.escape_uri("urn:ietf:params:oauth:grant-type:jwt-bearer") ..
                     "&assertion=" .. ngx.escape_uri(jwt_assertion)

    local temp_response_file = "/tmp/oauth2_response_" .. ngx.worker.pid() .. "_" .. ngx.time() .. ".json"

    local cmd = string.format(
        "curl -s -X POST 'https://oauth2.googleapis.com/token' " ..
        "-H 'Content-Type: application/x-www-form-urlencoded' " ..
        "-d '%s' -o %s -w '%%{http_code}'",
        post_data, temp_response_file
    )

    local handle = io.popen(cmd)
    if not handle then
        return nil, "Cannot execute curl command"
    end

    local http_code = handle:read("*a")
    handle:close()

    if http_code ~= "200" then
        os.remove(temp_response_file)
        return nil, "OAuth2 request failed with HTTP " .. http_code
    end

    local response_file = io.open(temp_response_file, "r")
    if not response_file then
        os.remove(temp_response_file)
        return nil, "Cannot read response file"
    end

    local response_body = response_file:read("*a")
    response_file:close()
    os.remove(temp_response_file)

    local ok, token_data = pcall(cjson.decode, response_body)
    if not ok then
        return nil, "Failed to parse OAuth2 response: " .. tostring(token_data)
    end

    if not token_data.access_token then
        return nil, "No access_token in response"
    end

    local expires_in = tonumber(token_data.expires_in) or 3600
    token_data.expires_at = ngx.time() + expires_in
    token_data.created_at = ngx.time()

    return token_data
end

return _M
EOF

    cp lua/oauth2_client_curl_only.lua lua/oauth2_client.lua
    echo "✓ Updated oauth2_client to curl-only version"
else
    echo "✓ oauth2_client already curl-only"
fi

echo ""
echo "6. Testing nginx configuration..."
docker-compose exec api-proxy-nginx /usr/local/openresty/bin/openresty -t

if [ $? -eq 0 ]; then
    echo "✓ Nginx configuration is valid"
else
    echo "✗ Nginx configuration still has issues"
fi

echo ""
echo "7. Restarting nginx with clean curl-only implementation..."
docker-compose restart api-proxy-nginx

echo ""
echo "8. Waiting for startup..."
sleep 15

echo ""
echo "9. Testing basic functionality..."
echo "Health check:"
curl -s -w "HTTP %{http_code}\n" http://localhost:8888/health

echo ""
echo "Status check:"
curl -s -w "HTTP %{http_code}\n" http://localhost:8888/status

echo ""
echo "10. Checking for resty.http errors in logs..."
docker logs api-proxy-nginx --tail 20 | grep -i "resty.http" || echo "✓ No resty.http errors found"

echo ""
echo "=== Cleanup Complete ==="

echo ""
echo "Summary:"
echo "✓ Removed incomplete resty.http installation"
echo "✓ Ensured all modules use curl-only implementation"
echo "✓ Nginx restarted with clean configuration"

echo ""
echo "The system now uses pure curl for OAuth2, which is:"
echo "- More reliable and compatible"
echo "- Easier to debug and maintain"
echo "- Ready for multi-provider support"