local _M = {}

-- 辅助函数：分割字符串
local function split(str, sep)
    local result = {}
    if not str or str == "" then
        return result
    end

    for match in (str .. sep):gmatch("(.-)" .. sep) do
        if match ~= "" then
            table.insert(result, match)
        end
    end
    return result
end

-- 辅助函数：解析权重配置
local function parse_weights(weights_str, keys)
    local weights = {}
    if not weights_str or weights_str == "" then
        -- 默认所有key权重为1
        for _, key in ipairs(keys) do
            weights[key] = 1
        end
        return weights
    end

    -- 解析格式: key1:weight1,key2:weight2
    for weight_pair in weights_str:gmatch("[^,]+") do
        local key, weight = weight_pair:match("^([^:]+):(%d+)$")
        if key and weight then
            weights[key] = tonumber(weight)
        end
    end

    return weights
end

-- 辅助函数：解析客户端keys
local function parse_client_keys(client_keys_str)
    local keys = {}
    if not client_keys_str or client_keys_str == "" then
        return keys
    end

    for key in split(client_keys_str, ",") do
        keys[key] = true
    end
    return keys
end

-- 配置参数
_M.config = {}

-- 初始化配置函数
local function init_config()
    -- 从环境变量读取 API Keys
    local gemini_api_keys_str = os.getenv("GEMINI_API_KEYS")
    local real_api_keys = split(gemini_api_keys_str, ",")

    -- 如果没有环境变量，使用默认配置
    if #real_api_keys == 0 then
        real_api_keys = {"default_gemini_key_1", "default_gemini_key_2", "default_gemini_key_3"}
    end

    -- 从环境变量读取轮询策略
    local key_rotation_strategy = os.getenv("KEY_ROTATION_STRATEGY") or "round_robin"
    local gemini_key_weights_str = os.getenv("GEMINI_KEY_WEIGHTS") or ""
    local key_max_retries = tonumber(os.getenv("KEY_MAX_RETRIES")) or 3
    local key_retry_on_failure = os.getenv("KEY_RETRY_ON_FAILURE") or "true"

    -- 从环境变量读取客户端API Keys
    local gemini_api_keys_old = os.getenv("GEMINI_API_KEYS_OLD") or ""

    -- 从环境变量读取限流配置
    local rate_limit_rpm = tonumber(os.getenv("RATE_LIMIT_REQUESTS_PER_MINUTE")) or 60

    -- 从环境变量读取日志配置
    local log_request_body = os.getenv("LOG_REQUEST_BODY") or "true"
    local log_response_body = os.getenv("LOG_RESPONSE_BODY") or "false"

    -- 从环境变量读取端口配置
    local http_port = tonumber(os.getenv("HTTP_PORT")) or 8080
    local https_port = tonumber(os.getenv("HTTPS_PORT")) or 8443

    -- 从环境变量读取Redis配置
    local redis_host = os.getenv("REDIS_HOST") or "api-proxy-redis"
    local redis_port = tonumber(os.getenv("REDIS_PORT")) or 6379
    local redis_password = os.getenv("REDIS_PASSWORD") or ""

    -- 构建配置
    _M.config = {
        -- 真实的API Key列表（支持轮询）
        real_api_keys = real_api_keys,

        -- Key轮询策略配置
        key_rotation = {
            strategy = key_rotation_strategy,
            weights = parse_weights(gemini_key_weights_str, real_api_keys),
            retry_on_failure = (key_retry_on_failure == "true"),
            max_retries = key_max_retries,
        },

        -- 允许的旧API Key列表（客户端key）
        allowed_keys = parse_client_keys(gemini_api_keys_old),

        -- 限流配置
        rate_limit = {
            requests_per_minute = rate_limit_rpm,
            check_interval = 1,
        },

        -- 日志配置
        logging = {
            log_request_body = (log_request_body == "true"),
            log_response_body = (log_response_body == "false"),
            log_file = "/var/log/nginx/gemini_proxy.log",
        },

        -- 端口配置
        ports = {
            http = http_port,
            https = https_port,
        },

        -- Redis配置
        redis = {
            host = redis_host,
            port = redis_port,
            password = redis_password,
        },

        -- 上游服务器
        upstream = {
            host = "generativelanguage.googleapis.com",
            port = 443,
            scheme = "https",
        }
    }
end

-- 初始化配置
init_config()

-- 提供重新加载配置的函数
function _M.reload_config()
    init_config()
    return _M.config
end

return _M