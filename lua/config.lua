local _M = {}

-- 配置参数
_M.config = {
    -- 真实的API Key列表（支持轮询）
    real_api_keys = {
        "GEMINI_API_KEY_1",
        "GEMINI_API_KEY_2",
        "GEMINI_API_KEY_3",
        -- 可以添加更多真实key
    },

    -- Key轮询策略配置
    key_rotation = {
        -- 轮询策略: round_robin, random, weighted, least_used
        strategy = "round_robin",
        -- Key权重（用于weighted策略）
        weights = {
            "GEMINI_API_KEY_1" = 1,
            "GEMINI_API_KEY_2" = 1,
            "GEMINI_API_KEY_3" = 1,
        },
        -- 失败后重试其他key
        retry_on_failure = true,
        -- 最大重试次数
        max_retries = 3,
    },

    -- 允许的旧API Key列表（客户端key）
    allowed_keys = {
        ["$GEMINI_API_KEY----old"] = true,
        -- 可以添加更多key
        ["another-old-key"] = true,
        ["client_key_3"] = true,
    },

    -- 限流配置
    rate_limit = {
        -- 每个key每分钟最大请求数
        requests_per_minute = 60,
        -- 限流检查间隔（秒）
        check_interval = 1,
    },

    -- 日志配置
    logging = {
        -- 是否记录请求体
        log_request_body = true,
        -- 是否记录响应体
        log_response_body = false,
        -- 日志文件路径
        log_file = "/var/log/nginx/gemini_proxy.log",
    },

    -- 上游服务器
    upstream = {
        host = "generativelanguage.googleapis.com",
        port = 443,
        scheme = "https",
    }
}

return _M