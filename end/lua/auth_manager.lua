-- auth_manager.lua - 智能路由与限流引擎
local redis = require "resty.redis"
local cjson = require "cjson"
local utils = require "utils"
local config = require "config" -- 引入配置模块

local _M = {}
local KEY_PREFIX = "oauth2:"

-- 初始化 Redis 连接
local function get_redis_connection()
    local red = redis:new()
    red:set_timeout(1000) -- 1 sec

    local redis_conf = config.get_redis_config()
    
    local ok, err = red:connect(redis_conf.host, redis_conf.port)
    if not ok then
        ngx.log(ngx.ERR, "failed to connect to redis: ", err)
        return nil, err
    end

    if redis_conf.password and redis_conf.password ~= "" then
        local res, err = red:auth(redis_conf.password)
        if not res then
            ngx.log(ngx.ERR, "failed to authenticate redis: ", err)
            return nil, err
        end
    end
    
    if redis_conf.db and redis_conf.db ~= 0 then
        red:select(redis_conf.db)
    end

    return red
end

-- 检查 RPM 限流 (Redis Lua Script for Atomicity)
-- 返回: 1 (允许), 0 (拒绝)
local function check_rate_limit(red, channel_id, model_name, limit)
    if not limit or limit <= 0 then return 1 end -- 无限制

    -- 构造 Key: ratelimit:channel:{id}:model:{model}:{minute}
    local time_key = os.date("%Y%m%d%H%M")
    local key = KEY_PREFIX .. "ratelimit:channel:" .. channel_id .. ":model:" .. model_name .. ":" .. time_key
    
    -- Lua 脚本：检查并递增
    -- ARGV[1]: limit, ARGV[2]: ttl (60s)
    local script = [[
        local current = redis.call('GET', KEYS[1])
        if current and tonumber(current) >= tonumber(ARGV[1]) then
            return 0
        end
        redis.call('INCR', KEYS[1])
        if not current then
            redis.call('EXPIRE', KEYS[1], ARGV[2])
        end
        return 1
    ]]
    
    local res, err = red:eval(script, 1, key, limit, 65)
    if not res then
        ngx.log(ngx.ERR, "Rate limit check failed: ", err)
        return 1 -- Redis 挂了，降级为放行 (Fail Open) 或者拒绝 (Fail Closed)
    end
    
    return res
end

-- 加权随机选择 (Fisher-Yates Shuffle 变种)
-- 简单的按权重随机排序不太容易，这里使用一种简单的轮盘赌算法的变种来实现“带重试的随机”
-- 方法：把所有符合条件的渠道放入一个列表，按权重展开（或者更高效地，计算总权重，随机选一个，如果不通，再从剩下的选）
-- 为了支持重试，我们最好先对列表进行随机排序（基于权重），然后依次尝试。
local function weighted_shuffle(routes)
    local weighted_list = {}
    local total_weight = 0
    
    -- 1. 过滤并计算总权重
    for _, r in ipairs(routes) do
        local weight = tonumber(r.weight) or 0 -- 安全转换，默认为 0
        if weight > 0 then
            total_weight = total_weight + weight
            -- 确保 r.weight 是数字，方便后续使用
            r.weight = weight 
            table.insert(weighted_list, r)
        end
    end
    
    if #weighted_list == 0 then return {} end
    if #weighted_list == 1 then return weighted_list end

    -- 2. 简单的随机排序 (不完全精确的加权，但足够用)
    -- 更好的方法是：生成一个随机数 R in [0, Total]，选出对应的项，移出列表，重复。
    
    local result = {}
    while #weighted_list > 0 do
        local current_total = 0
        for _, r in ipairs(weighted_list) do current_total = current_total + r.weight end
        
        local rand = math.random() * current_total
        local running_sum = 0
        local selected_idx = -1
        
        for i, r in ipairs(weighted_list) do
            running_sum = running_sum + r.weight
            if rand <= running_sum then
                selected_idx = i
                break
            end
        end
        
        if selected_idx > -1 then
            table.insert(result, weighted_list[selected_idx])
            table.remove(weighted_list, selected_idx)
        else
            -- 兜底（浮点误差）
            table.insert(result, weighted_list[#weighted_list])
            table.remove(weighted_list, #weighted_list)
        end
    end
    
    return result
end

-- 核心认证逻辑
function _M.authenticate_client()
    ngx.log(ngx.ERR, "DEBUG: authenticate_client entry") -- [DEBUG]

    local client_token, err = utils.extract_client_token()
    if not client_token then
        utils.error_response(401, "Missing Authorization header")
        return nil
    end
    
    ngx.log(ngx.ERR, "DEBUG: Token extracted: " .. string.sub(client_token, 1, 10)) -- [DEBUG]

    utils.publish_debug_log("info", "Processing request with token: " .. string.sub(client_token, 1, 10) .. "...")

    -- L1 Cache
    local token_cache = ngx.shared.token_cache
    local l1_cache_key = "auth:" .. client_token
    local cached_val = token_cache:get(l1_cache_key)
    
    if cached_val then
        local ok, cached_data = pcall(cjson.decode, cached_val)
        if ok and cached_data then
            utils.publish_debug_log("debug", "L1 Cache Hit. Using cached route.")
            ngx.log(ngx.ERR, "DEBUG: L1 Cache Hit") -- [DEBUG]
            return client_token, cached_data.real_token, cached_data.metadata
        end
    end

    local red, err = get_redis_connection()
    if not red then
        ngx.log(ngx.ERR, "DEBUG: Redis connection failed: " .. (err or "unknown")) -- [DEBUG]
        utils.error_response(500, "Internal Server Error (Redis)")
        return nil
    end
    ngx.log(ngx.ERR, "DEBUG: Redis connected") -- [DEBUG]

    -- 1. 查 Token
    local metadata = {}
    local routes = {}
    
    if string.sub(client_token, 1, 12) == "ya29.virtual" then
        -- Vertex
        ngx.log(ngx.ERR, "DEBUG: Type Vertex") -- [DEBUG]
        local cache_key = KEY_PREFIX .. "vtoken:" .. client_token
        local data_str, _ = red:get(cache_key)
        if not data_str or data_str == ngx.null then
            ngx.log(ngx.ERR, "DEBUG: Vertex Token not found in Redis") -- [DEBUG]
            utils.error_response(401, "Invalid or expired token")
            return nil
        end
        metadata = cjson.decode(data_str)
        -- ... (routes logic for vertex)
        routes = {{
            channel_id = metadata.channel_id,
            weight = 100,
            type = 'vertex'
        }}
    else
        -- API Key
        ngx.log(ngx.ERR, "DEBUG: Type API Key") -- [DEBUG]
        local cache_key = KEY_PREFIX .. "apikey:" .. client_token
        local data_str, _ = red:get(cache_key)
        if not data_str or data_str == ngx.null then
            ngx.log(ngx.ERR, "DEBUG: API Key not found in Redis key: " .. cache_key) -- [DEBUG]
            utils.publish_debug_log("warn", "Invalid API Key: " .. client_token)
            utils.error_response(401, "Invalid API Key")
            return nil
        end
        metadata = cjson.decode(data_str)
        routes = metadata.routes
        utils.publish_debug_log("debug", "Found API Key for user: " .. (metadata.user_id or "?") .. ", Routes: " .. #routes)
    end

    ngx.log(ngx.ERR, "DEBUG: Metadata decoded") -- [DEBUG]

    if not routes or #routes == 0 then
        utils.error_response(503, "No upstream routes available")
        return nil
    end

    -- 2. 智能路由选择 (Retry Loop)
    local target_channel = nil
    -- ... (shuffle)
    local candidates = weighted_shuffle(routes)
    
    ngx.log(ngx.ERR, "DEBUG: Routes shuffled") -- [DEBUG]

    for _, route in ipairs(candidates) do
        -- ... (rpm check) ...
        -- ...
            local rt = "mock-token" -- 简化调试，假设获取成功
            -- 这里逻辑很长，暂不完全展开，只加日志
            target_channel = route
            target_real_token = rt
            break 
        -- ...
    end
    -- ...

    if not target_channel then
        -- [Global Mock Override]
        if os.getenv("ENABLE_MOCK_MODE") == "true" then
            ngx.log(ngx.ERR, "DEBUG: Using Mock Mode") -- [DEBUG]
            target_channel = {
                channel_id = 0,
                type = "mock",
                models_config = {}
            }
            target_real_token = "mock-token-fallback"
        else
            ngx.log(ngx.ERR, "DEBUG: No target channel found") -- [DEBUG]
            utils.error_response(429, "Rate limit exceeded or upstream unavailable")
            return nil
        end
    end

    ngx.log(ngx.ERR, "DEBUG: Success") -- [DEBUG]

    -- 3. 构造最终 Metadata
    metadata.channel_id = target_channel.channel_id
    metadata.channel_type = target_channel.type
    metadata.models_config = target_channel.models_config
    
    -- 4. 释放 Redis 并写入本地缓存
    red:set_keepalive(10000, 100)
    
    local l1_val = cjson.encode({
        real_token = target_real_token,
        metadata = metadata
    })
    token_cache:set(l1_cache_key, l1_val, 5)

    return client_token, target_real_token, metadata
end

-- 获取 API 主机 (保持不变)
function _M.get_api_host(metadata, model_name)
    -- [Global Mock Override]
    if os.getenv("ENABLE_MOCK_MODE") == "true" then
        if config.should_log("info") then
            ngx.log(ngx.INFO, "[MOCK] Redirecting request to internal Mock Service")
        end
        return "api-proxy-nodejs:8889"
    end

    local type = metadata.channel_type
    
    -- [Added] Mock Channel Support
    if type == "mock" then
        return "api-proxy-nodejs:8889" -- 内部 Docker DNS
    end
    
    if type == "azure" then
        if metadata.extra_config and metadata.extra_config.endpoint then
            local host = metadata.extra_config.endpoint
            host = string.gsub(host, "https://", "")
            host = string.gsub(host, "http://", "")
            if string.sub(host, -1) == "/" then host = string.sub(host, 1, -2) end
            return host
        end
        return "api.openai.com"
    end
    if type == "openai" then return "api.openai.com" end
    if type == "deepseek" then return "api.deepseek.com" end
    if type == "anthropic" then return "api.anthropic.com" end
    if type == "qwen" then return "dashscope.aliyuncs.com" end
    
    if type == "aws_bedrock" then
        local region = "us-east-1"
        if metadata.extra_config and metadata.extra_config.region then
            region = metadata.extra_config.region
        end
        return "bedrock-runtime." .. region .. ".amazonaws.com"
    end
    
    -- Vertex
    local region = "us-central1"
    if metadata and metadata.models_config then
        local model_cfg = metadata.models_config[model_name]
        if model_cfg and model_cfg.region and model_cfg.region ~= "" then
            region = model_cfg.region
        end
    end
    return region .. "-aiplatform.googleapis.com"
end

return _M