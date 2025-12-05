-- auth_manager.lua - 基于 Redis 的高性能 Token 交换实现
local redis = require "resty.redis"
local cjson = require "cjson"
local utils = require "utils"

local _M = {}

-- 初始化 Redis 连接
local function get_redis_connection()
    local red = redis:new()
    red:set_timeout(1000) -- 1 sec

    -- 从环境变量或配置获取 Redis 地址
    local host = "api-proxy-redis"
    local port = 6379
    local password = nil -- 如果有密码需设置，这里假设内部网络无密码或默认

    local ok, err = red:connect(host, port)
    if not ok then
        ngx.log(ngx.ERR, "failed to connect to redis: ", err)
        return nil, err
    end

    -- 如果有密码认证
    -- local res, err = red:auth("123456")
    -- if not res then ... end

    return red
end

-- 核心认证逻辑
function _M.authenticate_client()
    -- 1. 提取 Token
    local client_token, err = utils.extract_client_token()
    if not client_token then
        utils.error_response(401, "Missing Authorization header")
        return nil
    end

    -- 2. 连接 Redis
    local red, err = get_redis_connection()
    if not red then
        utils.error_response(500, "Internal Server Error (Redis)")
        return nil
    end

    local real_token = nil
    local metadata = {}

    -- 3. 区分 Token 类型并查表
    if string.sub(client_token, 1, 12) == "ya29.virtual" then
        -- Case A: Vertex Mock Token
        local cache_key = "vtoken:" .. client_token
        local data_str, err = red:get(cache_key)

        if not data_str or data_str == ngx.null then
            red:set_keepalive(10000, 100)
            utils.error_response(401, "Invalid or expired token")
            return nil
        end

        local mapping_data = cjson.decode(data_str)
        
        -- 获取真实 Token (Node.js 已将其存入 vtoken 映射中，或我们需要二次查找)
        -- 根据之前的 Node.js 实现，mapping_data 包含 real_token
        real_token = mapping_data.real_token
        metadata = mapping_data -- 包含 channel_id, user_id 等

        -- 如果 vtoken 里没存 real_token (防止过期策略), 可以二次查找:
        -- local rt_key = "real_token:" .. mapping_data.channel_id
        -- real_token = red:get(rt_key)

    else
        -- Case B: Static API Key (e.g., sk-...)
        -- 暂未完全实现 Node.js 端的 API Key 写入逻辑，预留接口
        -- local cache_key = "apikey:" .. client_token
        -- ...
        
        -- 临时：如果不是 ya29.virtual，可能是直接透传或者是未知的
        -- 这里先报 401，等待 API Key 功能完善
        red:set_keepalive(10000, 100)
        utils.error_response(401, "Unsupported token format")
        return nil
    end

    -- 4. 验证结果
    if not real_token or real_token == ngx.null then
        red:set_keepalive(10000, 100)
        utils.error_response(503, "Upstream token unavailable")
        return nil
    end

    -- 5. 释放 Redis 连接 (放回连接池)
    red:set_keepalive(10000, 100)

    -- 6. 返回结果
    -- 参数对应: client_token, real_access_token, metadata (代替 key_filename)
    return client_token, real_token, metadata
end

-- 获取 API 主机
-- key_filename 参数现在接收的是 metadata 表
function _M.get_api_host(metadata, model_name)
    -- 默认 Vertex Host
    -- 将来可以根据 metadata.channel_id 或 metadata.region 动态调整
    -- 例如: if metadata.region == "europe-west1" then return "europe-west1-aiplatform..." end
    
    -- 这里先硬编码为 us-central1，这是 Vertex 的默认值
    return "us-central1-aiplatform.googleapis.com"
end

return _M
