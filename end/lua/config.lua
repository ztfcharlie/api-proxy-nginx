-- config.lua - 集中配置管理 (Redis & Env)
local _M = {}

-- 默认配置
local defaults = {
    redis_host = "api-proxy-redis",
    redis_port = 6379,
    redis_password = nil,
    redis_db = 0,
    
    -- Body 解析限制
    body_parse_limit = 524288,
    
    -- 日志级别
    log_level = "info"
}

local config_data = {}

-- 初始化配置
function _M.init()
    -- 从环境变量加载
    config_data.redis_host = os.getenv("REDIS_HOST") or defaults.redis_host
    config_data.redis_port = tonumber(os.getenv("REDIS_PORT")) or defaults.redis_port
    config_data.redis_password = os.getenv("REDIS_PASSWORD") -- 可以为 nil
    config_data.redis_db = tonumber(os.getenv("REDIS_DB")) or defaults.redis_db
    
    config_data.body_parse_limit = tonumber(os.getenv("LUA_BODY_PARSE_LIMIT")) or defaults.body_parse_limit
    
    ngx.log(ngx.INFO, "Config initialized. Redis: ", config_data.redis_host, ":", config_data.redis_port)
end

-- 获取配置项
function _M.get(key)
    return config_data[key] or defaults[key]
end

-- 获取 Redis 配置 (便捷方法)
function _M.get_redis_config()
    return {
        host = _M.get("redis_host"),
        port = _M.get("redis_port"),
        password = _M.get("redis_password"),
        db = _M.get("redis_db")
    }
end

-- 获取应用配置 (兼容旧接口，防止报错，但返回空或默认)
function _M.get_app_config()
    return {
        logging = { level = _M.get("log_level") }
    }
end

-- 测试输出开关 (兼容 utils.lua)
function _M.should_test_output(type)
    return false
end

-- 日志开关 (兼容 utils.lua)
function _M.should_log(level)
    return true 
end

return _M