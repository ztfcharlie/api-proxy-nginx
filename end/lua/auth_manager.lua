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
        real_token = mapping_data.real_token
        metadata = mapping_data

        -- 增强：获取 Channel 的详细配置 (包含 models_config)
        local channel_key = "channel:" .. tostring(metadata.channel_id)
        local channel_data_str, _ = red:get(channel_key)
        if channel_data_str and channel_data_str ~= ngx.null then
            local channel_data = cjson.decode(channel_data_str)
            metadata.models_config = channel_data.models_config
            metadata.channel_type = channel_data.type
        end

    else
        -- Case B: Static API Key (OpenAI/Azure)
        -- 实现 apikey:xxx 查找
        local cache_key = "apikey:" .. client_token
        local data_str, err = red:get(cache_key)
        
        if not data_str or data_str == ngx.null then
            red:set_keepalive(10000, 100)
            utils.error_response(401, "Invalid API Key")
            return nil
        end
        
        local mapping_data = cjson.decode(data_str)
        
        -- 对于 API Key 模式，我们可能需要做简单的负载均衡（Lua端）或者直接取第一个
        -- 这里的实现假设 mapping_data.routes 包含 channel_id
        -- 简化：直接取第一个可用渠道
        local route = mapping_data.routes[1]
        local channel_id = route.channel_id
        
        -- 获取 Channel 详情 (获取真实 Key)
        local channel_key = "channel:" .. tostring(channel_id)
        local channel_data_str, _ = red:get(channel_key)
        
        if not channel_data_str or channel_data_str == ngx.null then
             red:set_keepalive(10000, 100)
             utils.error_response(503, "Upstream channel configuration missing")
             return nil
        end
        
        local channel_data = cjson.decode(channel_data_str)
        real_token = channel_data.key -- 对于非 Vertex，key 存在这里
        metadata = mapping_data
        metadata.channel_id = channel_id
        metadata.channel_type = channel_data.type
        metadata.models_config = channel_data.models_config
        metadata.extra_config = channel_data.extra_config -- Azure Endpoint
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
    return client_token, real_token, metadata
end

-- 获取 API 主机
function _M.get_api_host(metadata, model_name)
    local type = metadata.channel_type
    
    -- 1. Azure: 从 extra_config 获取 endpoint
    if type == "azure" then
        if metadata.extra_config and metadata.extra_config.endpoint then
            local host = metadata.extra_config.endpoint
            host = string.gsub(host, "https://", "")
            host = string.gsub(host, "http://", "")
            if string.sub(host, -1) == "/" then
                host = string.sub(host, 1, -2)
            end
            return host
        end
        return "api.openai.com" -- Fallback
    end

    -- 2. OpenAI
    if type == "openai" then
        return "api.openai.com"
    end

    -- 3. DeepSeek
    if type == "deepseek" then
        return "api.deepseek.com"
    end

    -- 4. Anthropic
    if type == "anthropic" then
        return "api.anthropic.com"
    end

    -- 5. Qwen (Aliyun Dashscope)
    if type == "qwen" then
        return "dashscope.aliyuncs.com"
    end

    -- 6. Vertex (Google) - 默认处理
    -- 尝试从 models_config 获取 region，默认 us-central1
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
