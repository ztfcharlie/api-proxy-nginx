local key_manager = require "key_manager"
local logger = require "logger"
local config = require "config"

local _M = {}

-- 处理响应，记录Key使用情况
function _M.handle_response()
    local status = ngx.var.status
    local used_key = ngx.var.real_api_key_used

    if status >= 200 and status < 300 then
        -- 成功响应
        if used_key and used_key ~= "" then
            key_manager.mark_key_success(used_key)
        end
    elseif status >= 400 and status < 500 then
        -- 客户端错误（可能是Key问题）
        if status == 401 or status == 403 then
            if used_key and used_key ~= "" then
                key_manager.mark_key_failure(used_key)
            end
        end
    elseif status >= 500 then
        -- 服务器错误
        if used_key and used_key ~= "" then
            key_manager.mark_key_failure(used_key)
        end
    end

    -- 记录日志
    logger.log_request()
end

-- 重试机制处理
function _M.handle_retry()
    local key_manager = require "key_manager"
    local old_key = ngx.var.http_x_goog_api_key
    local max_retries = config.config.key_rotation.max_retries

    if not config.config.key_rotation.retry_on_failure then
        return false
    end

    -- 尝试获取其他key
    local new_key = key_manager.get_next_healthy_key(old_key)

    if new_key and new_key ~= ngx.var.new_api_key then
        -- 更新使用的key
        ngx.var.new_api_key = new_key
        ngx.var.real_api_key_used = new_key

        -- 记录重试
        ngx.log(ngx.INFO, "Retrying request with different key: " .. new_key)

        return true
    end

    return false
end

-- 监控API Key健康状态
function _M.key_health_monitor()
    local key_stats = key_manager.get_key_stats()
    local healthy_count = key_manager.get_healthy_key_count()
    local total_keys = #config.config.real_api_keys

    -- 记录Key健康状态
    ngx.log(ngx.INFO, string.format(
        "Key Health Status: %d/%d healthy keys",
        healthy_count, total_keys
    ))

    -- 如果健康key少于总数的50%，发出警告
    if healthy_count < total_keys / 2 then
        ngx.log(ngx.WARN, string.format(
            "Warning: Only %d out of %d API keys are healthy!",
            healthy_count, total_keys
        ))
    end

    -- 记录每个key的统计信息（调试级别）
    if ngx.log(ngx.DEBUG) then
        for key, stats in pairs(key_stats) do
            ngx.log(ngx.DEBUG, string.format(
                "Key %s: usage=%d, success=%d, failure=%d, healthy=%s",
                key, stats.usage_count, stats.success_count,
                stats.failure_count, tostring(stats.is_healthy)
            ))
        end
    end
end

-- 获取API Key使用报告
function _M.get_key_usage_report()
    local key_stats = key_manager.get_key_stats()
    local report = {
        timestamp = ngx.time(),
        total_keys = #config.config.real_api_keys,
        healthy_keys = 0,
        key_details = {}
    }

    for _, key in ipairs(config.config.real_api_keys) do
        local stats = key_stats[key]
        if stats then
            if stats.is_healthy then
                report.healthy_keys = report.healthy_keys + 1
            end

            table.insert(report.key_details, {
                key = key,
                usage_count = stats.usage_count,
                success_count = stats.success_count,
                failure_count = stats.failure_count,
                consecutive_failures = stats.consecutive_failures,
                success_rate = stats.usage_count > 0 and
                              (stats.success_count / stats.usage_count * 100) or 0,
                is_healthy = stats.is_healthy,
                last_used = stats.last_used,
                last_failure_time = stats.last_failure_time
            })
        end
    end

    return report
end

-- 处理API配额超限
function _M.handle_quota_exceeded()
    local used_key = ngx.var.real_api_key_used

    if ngx.var.status == 429 then
        if used_key and used_key ~= "" then
            -- 临时标记key为不健康
            key_manager.mark_key_failure(used_key)
            ngx.log(ngx.WARN, "API key quota exceeded: " .. used_key)
        end

        -- 检查是否还有其他健康的key
        local healthy_count = key_manager.get_healthy_key_count()
        if healthy_count > 0 then
            -- 告知客户端可以重试
            ngx.header["Retry-After"] = "60"
            ngx.header["X-Available-Keys"] = tostring(healthy_count)
        end
    end
end

return _M