-- auth_manager.lua - 智能路由与限流引擎
local redis = require "resty.redis"
local cjson = require "cjson"
local utils = require "utils"
local config = require "config" 

local _M = {}
local KEY_PREFIX = "oauth2:"

-- [Added] 异步任务查询指纹库
local QUERY_PATTERNS = {
    { pattern = "/suno/v1/generation/([^/]+)$", type = "suno" },
    { pattern = "/mj/task/([^/]+)/fetch$",      type = "mj" },
    { pattern = "/v1/video/status/([^/]+)$",    type = "luma" }
}

-- [Added] OpenAI 兼容接口白名单 (用于过滤无法计费的接口如 Batch/Assistants)
local OPENAI_WHITELIST = {
    "^/v1/chat/completions",
    "^/v1/completions",
    "^/v1/responses",
    "^/v1/embeddings",
    "^/v1/images/",
    "^/v1/audio/speech",
    "^/v1/audio/transcriptions",
    "^/v1/audio/translations",
    "^/v1/audio/remix",
    "^/v1/video/",
    "^/v1/videos/",
    "^/v1/models"
}

-- 初始化 Redis 连接
local function get_redis_connection()
    local red = redis:new()
    red:set_timeout(1000) 

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

-- 检查 RPM 限流
local function check_rate_limit(red, channel_id, model_name, limit)
    if not limit or limit <= 0 then return 1 end 

    local time_key = os.date("%Y%m%d%H%M")
    local key = KEY_PREFIX .. "ratelimit:channel:" .. channel_id .. ":model:" .. model_name .. ":" .. time_key
    
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
        return 1 
    end
    
    return res
end

-- 加权随机选择
local function weighted_shuffle(routes)
    local weighted_list = {}
    local total_weight = 0
    
    for _, r in ipairs(routes) do
        local weight = tonumber(r.weight) or 0
        if weight > 0 then
            total_weight = total_weight + weight
            r.weight = weight 
            table.insert(weighted_list, r)
        end
    end
    
    if #weighted_list == 0 then return {} end
    if #weighted_list == 1 then return weighted_list end

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
            table.insert(result, weighted_list[#weighted_list])
            table.remove(weighted_list, #weighted_list)
        end
    end
    
    return result
end

-- 获取渠道支持的模型列表 (带缓存)
local function get_channel_models(red, channel_id)
    local cache = ngx.shared.token_cache
    local key = "ch_models:" .. channel_id
    local cached = cache:get(key)
    if cached then
        return cjson.decode(cached)
    end

    local redis_key = KEY_PREFIX .. "channel:" .. channel_id
    local data_str, err = red:get(redis_key)
    if not data_str or data_str == ngx.null then
        return nil
    end

    local ok, data = pcall(cjson.decode, data_str)
    if not ok or not data.models_config then
        return nil
    end
    
    local models = data.models_config
    cache:set(key, cjson.encode(models), 60) -- Cache for 60s
    return models
end

-- 核心认证逻辑
function _M.authenticate_client()
    -- [Security] API 白名单检查
    -- ... (existing whitelist check) ...
    local full_proxy = os.getenv("OPENAI_FULL_PROXY") == "true"
    local uri = ngx.var.uri
    
    if not full_proxy and string.sub(uri, 1, 4) == "/v1/" then
        local allowed = false
        for _, pattern in ipairs(OPENAI_WHITELIST) do
            if ngx.re.find(uri, pattern, "jo") then
                allowed = true
                break
            end
        end
        if not allowed then
            utils.error_response(403, "Endpoint not supported: " .. uri)
            return nil
        end
    end

    local client_token, err = utils.extract_client_token()
    if not client_token then
        utils.error_response(401, "Missing Authorization header")
        return nil
    end
    
    -- [Security] Extract Requested Model
    local requested_model = utils.extract_model_name(uri)
    if not requested_model then requested_model = "default" end
    
    -- Expose model name for logging
    ngx.var.model_name = requested_model

    utils.publish_debug_log("info", "Processing request: " .. uri .. " Model: " .. requested_model)

    -- L1 Cache
    -- ... (existing L1 cache logic) ...
    -- Note: If we use L1 cache, we skip model validation here because it was validated when cached?
    -- Yes, cached_data.metadata implies a selected route.
    -- But if the user changes the model in the request body but uses the same token?
    -- The L1 cache key is "auth:" + token. It doesn't include model!
    -- BUG ALERT: L1 Cache must include model name if routing depends on model.
    -- OR, we must validate model even on L1 cache hit.
    -- But L1 cache returns a *single* selected route (real_token).
    -- If I request gpt-4, get cached route A. Then request dall-e-3, get cached route A. Route A might not support dall-e-3!
    -- FIX: We should DISABLE L1 Cache for now, or include model in cache key.
    -- Let's append model to cache key.
    
    local token_cache = ngx.shared.token_cache
    local l1_cache_key = "auth:" .. client_token .. ":" .. requested_model -- [Fixed]
    local cached_val = token_cache:get(l1_cache_key)
    
    if cached_val then
        local ok, cached_data = pcall(cjson.decode, cached_val)
        if ok and cached_data then
            utils.publish_debug_log("debug", "L1 Cache Hit. Using cached route.")
            return client_token, cached_data.real_token, cached_data.metadata
        end
    end

    local red, err = get_redis_connection()
    if not red then
        utils.error_response(500, "Internal Server Error (Redis)")
        return nil
    end

    -- 1. 查 Token (获取路由列表)
    -- ... (existing token lookup) ...
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
        routes = {{
            channel_id = metadata.channel_id,
            weight = 100,
            type = 'vertex'
        }}
    else
        -- API Key
        local cache_key = KEY_PREFIX .. "apikey:" .. client_token
        local data_str, _ = red:get(cache_key)
        if not data_str or data_str == ngx.null then
            utils.error_response(401, "Invalid API Key")
            return nil
        end
        metadata = cjson.decode(data_str)
        routes = metadata.routes
        utils.publish_debug_log("debug", "Found API Key for user: " .. (metadata.user_id or "?") .. ", Routes: " .. #routes)
    end

    if not routes or #routes == 0 then
        utils.error_response(503, "No upstream routes available")
        return nil
    end

    -- 2. 路由选择 (Routing)
    local target_channel = nil
    local target_real_token = nil

    -- [Sticky Route Check]
    -- ... (existing sticky logic) ...
    local task_id = nil
    for _, p in ipairs(QUERY_PATTERNS) do
        local m = ngx.var.uri:match(p.pattern)
        if m then
            task_id = m
            break
        end
    end

    if task_id then
        utils.publish_debug_log("info", "Detected Async Query for Task ID: " .. task_id)
        
        local route_key = "oauth2:task_route:" .. task_id
        local channel_id_str, _ = red:get(route_key)
        
        -- Fallback to Internal DB
        if not channel_id_str or channel_id_str == ngx.null then
            utils.publish_debug_log("warn", "Route cache miss, checking internal DB...")
            local res = ngx.location.capture("/api/internal/task-route", {
                args = { task_id = task_id }
            })
            if res.status == 200 then
                local body = cjson.decode(res.body)
                channel_id_str = tostring(body.channel_id)
                red:setex(route_key, 86400, channel_id_str)
            end
        end

        if channel_id_str then
            local ch_id = tonumber(channel_id_str)
            for _, r in ipairs(routes) do
                if tonumber(r.channel_id) == ch_id then
                    -- Sticky route doesn't strictly check model support because it's a fetch
                    -- But strictly speaking, we should? No, fetch requests might not carry model.
                    -- So we skip model check for Sticky Routes.
                    target_channel = r
                    -- 需要在这里获取 real_token
                    local rt = nil
                    -- 简单的从 Redis 获取 Real Token (Standard Logic)
                    local rt_key = "real_token:" .. r.channel_id
                    rt, _ = red:get(rt_key)
                    
                    if rt and rt ~= ngx.null then
                        target_real_token = rt
                        utils.publish_debug_log("info", "Sticky Route Hit: Channel " .. channel_id_str)
                    else
                        target_channel = nil 
                    end
                    break
                end
            end
        end
    end

    -- [Smart Route Check] (如果 Sticky 没命中)
    if not target_channel then
        -- [Security] Filter routes by Model Support
        local candidates = {}
        for _, r in ipairs(routes) do
            local models = get_channel_models(red, r.channel_id)
            if models then
                -- Check if model is supported OR if "default" is configured (wildcard)
                if models[requested_model] or models["default"] then
                    table.insert(candidates, r)
                end
            elseif r.type == "mock" then
                 -- Always allow mock channels
                 table.insert(candidates, r)
            end
        end
        
        if #candidates == 0 then
             utils.error_response(400, "Model '" .. requested_model .. "' not supported by any available channel")
             return nil
        end

        -- Weighted Shuffle on FILTERED candidates
        candidates = weighted_shuffle(candidates)
        
        for _, route in ipairs(candidates) do
            -- 检查 RPM
            local passed = check_rate_limit(red, route.channel_id, "global", route.rpm_limit)
            if passed == 1 then
                -- 获取 Real Token
                local rt = nil
                
                -- Mock Mode Bypass
                if route.type == "mock" then
                    rt = "mock-token"
                elseif route.type == "vertex" then
                    -- Vertex Token 是动态的，已经存在 metadata 里了？不，那是 user token
                    -- Real Token 存在 Redis: real_token:{channel_id}
                    local rt_key = "real_token:" .. route.channel_id
                    rt, _ = red:get(rt_key)
                else
                    -- API Key 类型 (OpenAI/Claude等)
                    local ch_key = "oauth2:channel:" .. route.channel_id
                    local ch_data_str, _ = red:get(ch_key)
                    if ch_data_str and ch_data_str ~= ngx.null then
                        local ch_data = cjson.decode(ch_data_str)
                        if ch_data.key then
                            rt = ch_data.key
                        elseif ch_data.credentials then
                             rt = ch_data.credentials -- string or obj
                        end
                    end
                end

                if rt then
                    target_channel = route
                    target_real_token = rt
                    utils.publish_debug_log("info", "Selected Channel ID: " .. route.channel_id .. " (" .. route.type .. ")")
                    break 
                end
            end
        end
    end

    if not target_channel then
        -- [Global Mock Override]
        if os.getenv("ENABLE_MOCK_MODE") == "true" then
            if config.should_log("info") then
                ngx.log(ngx.WARN, "[MOCK] No valid upstream found, but Mock Mode is ON. Using fake channel.")
            end
            target_channel = {
                channel_id = 0,
                type = "mock",
                models_config = {}
            }
            target_real_token = "mock-token-fallback"
        else
            utils.error_response(429, "Rate limit exceeded or upstream unavailable")
            return nil
        end
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

-- 获取 API 主机
function _M.get_api_host(metadata, model_name)
    -- [Global Mock Override]
    if os.getenv("ENABLE_MOCK_MODE") == "true" then
        return "api-proxy-nodejs:8889"
    end

    local type = metadata.channel_type
    
    if type == "mock" then
        return "api-proxy-nodejs:8889"
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