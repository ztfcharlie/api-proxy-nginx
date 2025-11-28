local config = require "config"
local cjson = require "cjson"

local _M = {}

-- 轮询索引存储
local rotation_index = 0
local key_stats = {}

-- 初始化Key统计信息
function _M.init_key_stats()
    for i, key in ipairs(config.config.real_api_keys) do
        key_stats[key] = {
            index = i,
            usage_count = 0,
            success_count = 0,
            failure_count = 0,
            last_used = 0,
            is_healthy = true,
            last_failure_time = 0,
            consecutive_failures = 0
        }
    end
end

-- 获取下一个可用的Key
function _M.get_next_key()
    local strategy = config.config.key_rotation.strategy
    local key = nil

    if strategy == "round_robin" then
        key = _M.get_round_robin_key()
    elseif strategy == "random" then
        key = _M.get_random_key()
    elseif strategy == "weighted" then
        key = _M.get_weighted_key()
    elseif strategy == "least_used" then
        key = _M.get_least_used_key()
    else
        -- 默认使用round_robin
        key = _M.get_round_robin_key()
    end

    -- 检查Key是否健康
    if not key_stats[key].is_healthy then
        -- 尝试获取下一个健康的key
        return _M.get_next_healthy_key(key)
    end

    -- 更新使用统计
    _M.update_key_usage(key)

    return key
end

-- Round Robin策略
function _M.get_round_robin_key()
    local keys = config.config.real_api_keys
    local total_keys = #keys

    if total_keys == 0 then
        return nil
    end

    rotation_index = (rotation_index % total_keys) + 1
    return keys[rotation_index]
end

-- 随机策略
function _M.get_random_key()
    local keys = config.config.real_api_keys
    local total_keys = #keys

    if total_keys == 0 then
        return nil
    end

    local random_index = math.random(1, total_keys)
    return keys[random_index]
end

-- 加权策略
function _M.get_weighted_key()
    local keys = config.config.real_api_keys
    local weights = config.config.key_rotation.weights

    if #keys == 0 then
        return nil
    end

    -- 计算总权重
    local total_weight = 0
    for _, key in ipairs(keys) do
        total_weight = total_weight + (weights[key] or 1)
    end

    -- 随机选择
    local random_value = math.random() * total_weight
    local current_weight = 0

    for _, key in ipairs(keys) do
        current_weight = current_weight + (weights[key] or 1)
        if random_value <= current_weight then
            return key
        end
    end

    return keys[1]
end

-- 最少使用策略
function _M.get_least_used_key()
    local keys = config.config.real_api_keys
    local best_key = nil
    local min_usage = math.huge

    for _, key in ipairs(keys) do
        if key_stats[key].is_healthy then
            local usage = key_stats[key].usage_count
            if usage < min_usage then
                min_usage = usage
                best_key = key
            end
        end
    end

    return best_key
end

-- 获取下一个健康的Key
function _M.get_next_healthy_key(start_key)
    local keys = config.config.real_api_keys
    local start_index = key_stats[start_key].index

    -- 从当前key开始搜索
    for i = 1, #keys do
        local index = ((start_index + i - 2) % #keys) + 1
        local key = keys[index]

        if key_stats[key].is_healthy then
            _M.update_key_usage(key)
            return key
        end
    end

    -- 如果没有健康的key，返回原key（会触发重试逻辑）
    _M.update_key_usage(start_key)
    return start_key
end

-- 更新Key使用统计
function _M.update_key_usage(key)
    if key_stats[key] then
        key_stats[key].usage_count = key_stats[key].usage_count + 1
        key_stats[key].last_used = ngx.time()
    end
end

-- 标记Key成功
function _M.mark_key_success(key)
    if key_stats[key] then
        key_stats[key].success_count = key_stats[key].success_count + 1
        key_stats[key].consecutive_failures = 0

        -- 如果之前失败，现在恢复健康状态
        if not key_stats[key].is_healthy then
            key_stats[key].is_healthy = true
            ngx.log(ngx.INFO, "Key " .. key .. " recovered and marked as healthy")
        end
    end
end

-- 标记Key失败
function _M.mark_key_failure(key)
    if key_stats[key] then
        key_stats[key].failure_count = key_stats[key].failure_count + 1
        key_stats[key].consecutive_failures = key_stats[key].consecutive_failures + 1
        key_stats[key].last_failure_time = ngx.time()

        -- 连续失败3次标记为不健康
        if key_stats[key].consecutive_failures >= 3 then
            key_stats[key].is_healthy = false
            ngx.log(ngx.WARN, "Key " .. key .. " marked as unhealthy after " ..
                   key_stats[key].consecutive_failures .. " consecutive failures")
        end
    end
end

-- 检查Key是否健康
function _M.is_key_healthy(key)
    return key_stats[key] and key_stats[key].is_healthy
end

-- 获取Key统计信息
function _M.get_key_stats()
    return key_stats
end

-- 重置Key状态（定期恢复）
function _M.reset_key_health()
    local current_time = ngx.time()
    local recovery_timeout = 300 -- 5分钟后尝试恢复

    for key, stats in pairs(key_stats) do
        if not stats.is_healthy and
           current_time - stats.last_failure_time > recovery_timeout then
            stats.is_healthy = true
            stats.consecutive_failures = 0
            ngx.log(ngx.INFO, "Key " .. key .. " auto-recovered after timeout")
        end
    end
end

-- 获取健康Key数量
function _M.get_healthy_key_count()
    local count = 0
    for _, key in ipairs(config.config.real_api_keys) do
        if key_stats[key] and key_stats[key].is_healthy then
            count = count + 1
        end
    end
    return count
end

-- 选择最佳Key（考虑成功率）
function _M.get_best_key()
    local keys = config.config.real_api_keys
    local best_key = nil
    local best_score = -1

    for _, key in ipairs(keys) do
        if key_stats[key] and key_stats[key].is_healthy then
            local stats = key_stats[key]
            -- 计算成功率和使用率的综合分数
            local success_rate = stats.usage_count > 0 and
                                (stats.success_count / stats.usage_count) or 1.0
            local usage_penalty = stats.usage_count * 0.001
            local score = success_rate - usage_penalty

            if score > best_score then
                best_score = score
                best_key = key
            end
        end
    end

    return best_key
end

return _M