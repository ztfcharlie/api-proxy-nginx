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
    -- Server-side Google API key (from environment variable)
    google_key = os.getenv("GEMINI_API_KEY") or "your-google-api-key-here",

    -- Client API keys that should be replaced (you can add multiple)
    client_keys = {
        -- Add client keys here if you want to validate them
        -- ["client-key-1"] = true,
        -- ["client-key-2"] = true,
    }
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