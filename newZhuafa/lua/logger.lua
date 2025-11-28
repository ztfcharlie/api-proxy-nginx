-- Logger module for request logging
local config = require "config"

local _M = {}

-- Generate unique request ID
function _M.generate_request_id()
    local random = math.random(100000, 999999)
    local timestamp = ngx.now()
    return string.format("req_%d_%d", timestamp * 1000, random)
end

-- Format timestamp
function _M.format_timestamp(timestamp)
    if not timestamp then
        timestamp = ngx.now()
    end
    return os.date("%Y-%m-%d %H:%M:%S", timestamp)
end

-- Log request information
function _M.log_request(request_id, request_uri, status_code, start_time)
    if not config.logging.enabled then
        return
    end

    local end_time = ngx.now()
    local duration = end_time - (start_time or end_time)
    local timestamp = _M.format_timestamp(start_time)

    -- Create log entry (as per requirements: request ID, time, URL, status)
    local log_entry = string.format(
        '[%s] ID:%s URI:%s STATUS:%s DURATION:%.3fs CLIENT:%s',
        timestamp,
        request_id or "unknown",
        request_uri or "unknown",
        status_code or "unknown",
        duration,
        ngx.var.remote_addr or "unknown"
    )

    -- Write to log file
    local log_file = io.open(config.logging.log_file, "a")
    if log_file then
        log_file:write(log_entry .. "\n")
        log_file:close()
    else
        -- Fallback to nginx error log
        ngx.log(ngx.ERR, "Failed to write to log file: " .. config.logging.log_file)
        ngx.log(ngx.INFO, "REQUEST_LOG: " .. log_entry)
    end
end

-- Log error
function _M.log_error(request_id, error_message)
    if not config.logging.enabled then
        return
    end

    local timestamp = _M.format_timestamp()
    local log_entry = string.format(
        '[%s] ID:%s ERROR:%s CLIENT:%s',
        timestamp,
        request_id or "unknown",
        error_message or "unknown error",
        ngx.var.remote_addr or "unknown"
    )

    local log_file = io.open(config.logging.log_file, "a")
    if log_file then
        log_file:write(log_entry .. "\n")
        log_file:close()
    else
        ngx.log(ngx.ERR, "ERROR_LOG: " .. log_entry)
    end
end

-- Log startup information
function _M.log_startup()
    if not config.logging.enabled then
        return
    end

    local timestamp = _M.format_timestamp()
    local log_entry = string.format(
        '[%s] STARTUP: API Proxy started',
        timestamp
    )

    local log_file = io.open(config.logging.log_file, "a")
    if log_file then
        log_file:write(log_entry .. "\n")
        log_file:close()
    end

    ngx.log(ngx.INFO, "API Proxy logger initialized")
end

return _M