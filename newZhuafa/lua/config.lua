-- Configuration module for API proxy
local _M = {}

-- Google API configuration
_M.google_api = {
    host = "generativelanguage.googleapis.com",
    port = 443,
    scheme = "https"
}

-- API Key configuration
_M.api_keys = {
    -- Whether to validate client keys (set to false to allow any client key)
    validate_client_keys = false,

    -- Client API keys that should be replaced (you can add multiple)
    client_keys = {
        -- Add client keys here if you want to validate them
        -- ["client-key-1"] = true,
        -- ["client-key-2"] = true,
    }
}

-- Google Service Account configuration
_M.service_account = {
    -- JSON file path (主要配置方式)
    json_file = "/usr/local/openresty/nginx/service-account.json",

    -- Fallback: environment variables (如果 JSON 文件不存在)
    client_email = os.getenv("GOOGLE_CLIENT_EMAIL") or "",
    private_key = os.getenv("GOOGLE_PRIVATE_KEY") or "",
    project_id = os.getenv("GOOGLE_PROJECT_ID") or ""
}

-- Logging configuration
_M.logging = {
    enabled = true,
    log_file = "/usr/local/openresty/nginx/logs/requests.log",
    log_level = "info"
}

-- Rate limiting configuration (optional, for future use)
_M.rate_limit = {
    enabled = false,
    requests_per_minute = 60,
    burst = 10
}

-- Proxy configuration
_M.proxy = {
    connect_timeout = 10000,  -- 10 seconds
    send_timeout = 60000,     -- 60 seconds
    read_timeout = 60000,     -- 60 seconds
    buffer_size = 4096
}

-- Health check configuration
_M.health = {
    endpoint = "/health"
}

return _M