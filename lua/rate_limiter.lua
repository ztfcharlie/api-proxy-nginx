local config = require "config"

local _M = {}

function _M.is_rate_limited(api_key)
    local dict = ngx.shared.rate_limit
    local limit = config.config.rate_limit.requests_per_minute
    local current_time = ngx.time()
    local window_start = current_time - 60  -- 1分钟窗口

    -- 生成计数器key
    local counter_key = "rate_limit:" .. api_key

    -- 获取当前计数
    local current_count = dict:get(counter_key) or 0

    -- 检查是否超过限制
    if current_count >= limit then
        return true, current_count, limit
    end

    -- 获取上次更新时间
    local last_update = dict:get(counter_key .. ":time") or 0

    -- 如果超过1分钟窗口，重置计数
    if current_time - last_update >= 60 then
        dict:set(counter_key, 1, 60)
        dict:set(counter_key .. ":time", current_time, 60)
        return false, 1, limit
    end

    -- 增加计数
    local new_count = current_count + 1
    dict:incr(counter_key, 1, 1, 60)

    return false, new_count, limit
end

function _M.check_rate_limit()
    local api_key = ngx.var.http_x_goog_api_key

    if not api_key then
        return
    end

    local limited, current_count, limit = _M.is_rate_limited(api_key)

    if limited then
        ngx.status = 429
        ngx.header["Retry-After"] = "60"
        ngx.header["X-RateLimit-Limit"] = limit
        ngx.header["X-RateLimit-Remaining"] = "0"
        ngx.say("Rate limit exceeded. Maximum " .. limit .. " requests per minute.")
        ngx.exit(429)
        return
    end

    -- 添加响应头显示剩余配额
    local remaining = limit - current_count
    ngx.header["X-RateLimit-Limit"] = limit
    ngx.header["X-RateLimit-Remaining"] = remaining
end

return _M