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
        if r.weight > 0 then
            total_weight = total_weight + r.weight
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
    local client_token, err = utils.extract_client_token()
    if not client_token then
        utils.error_response(401, "Missing Authorization header")
        return nil
    end

    -- L1 Cache
    local token_cache = ngx.shared.token_cache
    local l1_cache_key = "auth:" .. client_token
    local cached_val = token_cache:get(l1_cache_key)
    
    if cached_val then
        local ok, cached_data = pcall(cjson.decode, cached_val)
        if ok and cached_data then
            return client_token, cached_data.real_token, cached_data.metadata
        end
    end

    local red, err = get_redis_connection()
    if not red then
        utils.error_response(500, "Internal Server Error (Redis)")
        return nil
    end

    -- 1. 查 Token
    local metadata = {}
    local routes = {}
    
    if string.sub(client_token, 1, 12) == "ya29.virtual" then
        -- Vertex
        local cache_key = KEY_PREFIX .. "vtoken:" .. client_token
        local data_str, _ = red:get(cache_key)
        if not data_str or data_str == ngx.null then
            utils.error_response(401, "Invalid or expired token")
            return nil
        end
        metadata = cjson.decode(data_str)
        -- Vertex vtoken 结构里没有 routes 数组? 
        -- 等等，SyncManager 写入 vtoken 时，确实没写 routes! 
        -- SyncManager 的 updateVirtualTokenCache 写入的是 apikey:xxx (User Token)
        -- vtoken 是 oauth2_mock.js 生成的。oauth2_mock.js 并没有注入 routes 列表。
        -- **这里是个问题**。
        
        -- 临时修复：如果 metadata 里没有 routes，说明是旧逻辑或者 Vertex 逻辑未对齐。
        -- 现有的 oauth2_mock.js 逻辑是：选定了一个 channel，生成 vtoken。所以 vtoken 绑定的是 单一 channel。
        -- 对于 Vertex，负载均衡发生在颁发 Token 时 (POST /token)。
        -- 所以 Vertex 不需要 Lua 做重试（除非颁发后那个 Channel 挂了）。
        
        -- Vertex 逻辑保持简单：直接用绑定的 channel_id
        routes = {{
            channel_id = metadata.channel_id,
            weight = 100,
            type = 'vertex',
            -- Vertex 的 RPM 检查需要去查 channel 配置
            -- 为了性能，我们假设 Vertex RPM 在颁发时已考虑（或暂不检查）
            -- 或者需要二次查 channel。
        }}
        
        -- 为了获取 Vertex 的 RPM，我们需要查 channel
        local ch_key = KEY_PREFIX .. "channel:" .. metadata.channel_id
        local ch_str, _ = red:get(ch_key)
        if ch_str and ch_str ~= ngx.null then
            local ch = cjson.decode(ch_str)
            routes[1].models_config = ch.models_config
        end

    else
        -- API Key
        local cache_key = KEY_PREFIX .. "apikey:" .. client_token
        local data_str, _ = red:get(cache_key)
        if not data_str or data_str == ngx.null then
            utils.error_response(401, "Invalid API Key")
            return nil
        end
        metadata = cjson.decode(data_str)
        routes = metadata.routes -- SyncManager 注入了 routes (含 RPM)
    end

    if not routes or #routes == 0 then
        utils.error_response(503, "No upstream routes available")
        return nil
    end

    -- 2. 智能路由选择 (Retry Loop)
    local target_channel = nil
    local target_real_token = nil
    local model_name = utils.extract_model_name(ngx.var.request_uri) or "default" 
    -- 注意：如果是 OpenAI 格式，model 在 body 里。Lua 读 body 有点重。
    -- 我们这里先假设 header 或 url 能拿到，或者略过 RPM 检查（如果不匹配）。
    -- 为了简化，我们先不读 Body，如果 URL 没模型名，就用 'default' 或者跳过限流。
    
    local candidates = weighted_shuffle(routes)
    
    for _, route in ipairs(candidates) do
        -- 2.1 检查 RPM
        local rpm_limit = 0
        local rate_limit_key_suffix = model_name -- 默认使用请求的模型名作为计数 Key

        if route.models_config then
            -- 尝试精确匹配
            local cfg = route.models_config[model_name]
            if cfg then 
                rpm_limit = tonumber(cfg.rpm)
            elseif route.models_config["default"] then
                -- 降级到 default 配置
                -- 关键：让所有未知模型共享同一个计数器 (Key = "default")
                -- 否则攻击者可以通过随机模型名绕过限流
                cfg = route.models_config["default"]
                rpm_limit = tonumber(cfg.rpm)
                rate_limit_key_suffix = "default" 
            end
        end
        
        local allowed = 1
        if rpm_limit > 0 then
            allowed = check_rate_limit(red, route.channel_id, rate_limit_key_suffix, rpm_limit)
        end
        
        if allowed == 1 then
            -- 2.2 尝试获取 Real Token
            local rt = nil
            if route.type == 'vertex' then
                local rt_key = KEY_PREFIX .. "real_token:" .. route.channel_id
                rt, _ = red:get(rt_key)
                if not rt or rt == ngx.null then
                    rt = nil -- Token 缺失，尝试下一个 Channel
                end
            else
                -- API Key 模式，Token 在 channel config 或者是 static
                -- SyncManager 应该把 key 放入 route 结构里吗？
                -- 为了安全，SyncManager 现在的 updateVirtualTokenCache 并没有把 credentials 放入 routes 数组
                -- 所以我们还得查 channel:id
                local ch_key = KEY_PREFIX .. "channel:" .. route.channel_id
                local ch_str, _ = red:get(ch_key)
                if ch_str and ch_str ~= ngx.null then
                    local ch = cjson.decode(ch_str)
                    rt = ch.key
                    -- 顺便补全 extra_config
                    metadata.extra_config = ch.extra_config
                end
            end
            
            if rt then
                target_channel = route
                target_real_token = rt
                break -- 成功选中！
            end
        end
    end

    if not target_channel then
        utils.error_response(429, "Rate limit exceeded or upstream unavailable")
        return nil
    end

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
    local type = metadata.channel_type
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