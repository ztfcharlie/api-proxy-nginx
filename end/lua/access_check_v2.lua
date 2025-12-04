-- lua/access_check.lua
local redis = require "resty.redis"
local cjson = require "cjson"

-- 1. 初始化 Redis 连接
local red = redis:new()
red:set_timeout(1000) -- 1 sec
local ok, err = red:connect("api-proxy-redis", 6379)
if not ok then
    ngx.log(ngx.ERR, "Redis connect failed: ", err)
    return ngx.exit(500)
end

-- 2. 获取 Authorization Header
local auth_header = ngx.var.http_authorization
if not auth_header then
    ngx.status = 401
    ngx.say(cjson.encode({error = "Missing Authorization header"}))
    return ngx.exit(401)
end

local _, _, token = string.find(auth_header, "Bearer%s+(.+)")
if not token then
    ngx.status = 401
    return ngx.exit(401)
end

-- 3. 识别 Token 类型
-- Case A: Vertex Mock Token (ya29.virtual....)
-- Case B: Static API Key (sk-mock-...)

local virtual_key_id = nil

if string.find(token, "ya29.virtual") then
    -- 是 OAuth2 模拟出的 Token
    local vtoken_data_str, err = red:get("vtoken:" .. token)
    if not vtoken_data_str or vtoken_data_str == ngx.null then
        ngx.status = 401
        ngx.say(cjson.encode({error = "Invalid or expired token"}))
        return ngx.exit(401)
    end
    local vtoken_data = cjson.decode(vtoken_data_str)
    virtual_key_id = vtoken_data.virtual_key_id
else
    -- 是直接的 API Key
    local vkey_id_str, err = red:get("vkey_idx:" .. token)
    if not vkey_id_str or vkey_id_str == ngx.null then
        ngx.status = 401
        ngx.say(cjson.encode({error = "Invalid API Key"}))
        return ngx.exit(401)
    end
    virtual_key_id = tonumber(vkey_id_str)
end

-- 4. 路由决策 (Load Balance)
-- 获取该 Virtual Key 绑定的所有 Channels
local route_json, err = red:get("route:" .. virtual_key_id)
if not route_json or route_json == ngx.null then
    ngx.status = 403
    ngx.say(cjson.encode({error = "No channels available for this key"}))
    return ngx.exit(403)
end

local routes = cjson.decode(route_json)
-- 简单轮询 (实际可用加权轮询算法优化)
-- 这里随机选一个
local idx = math.random(#routes)
local selected_route = routes[idx]
local channel_id = selected_route.channel_id

-- 5. 获取真实凭证
-- 检查该 Channel 的类型
local channel_type = selected_route.type -- 假设 Redis 中 route 数据包含 type

local real_token = nil

if channel_type == "vertex" then
    -- 对于 Vertex，从 Redis 获取最新的 Access Token (由 Node.js 后台刷新)
    real_token, err = red:get("real_token:" .. channel_id)
    if not real_token or real_token == ngx.null then
        ngx.log(ngx.ERR, "Real token missing for channel: ", channel_id)
        ngx.status = 503
        ngx.say(cjson.encode({error = "Upstream service unavailable (Token refresh pending)"}))
        return ngx.exit(503)
    end
else
    -- 对于 OpenAI 等，直接使用静态 Key
    real_token = selected_route.credentials.api_key
end

-- 6. 设置 Upstream 和 Headers
ngx.req.set_header("Authorization", "Bearer " .. real_token)

-- 可以在这里设置 Upstream Host，供 proxy_pass 使用
-- ngx.var.upstream_host = selected_route.base_url 
-- 注意：这需要 Nginx 变量配合

-- 7. 将连接放回池
red:set_keepalive(10000, 100)
