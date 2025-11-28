local config = require "config"

local _M = {}

function _M.validate_and_replace_key()
    -- 获取请求中的API Key
    local old_key = ngx.var.http_x_goog_api_key

    if not old_key then
        ngx.status = 401
        ngx.say("Missing API key")
        ngx.exit(401)
        return nil
    end

    -- 验证API Key是否在允许列表中
    if not config.config.allowed_keys[old_key] then
        ngx.status = 403
        ngx.say("Invalid API key")
        ngx.exit(403)
        return nil
    end

    -- 获取下一个可用的真实API Key
    local key_manager = require "key_manager"
    local new_key = key_manager.get_next_key()

    if not new_key then
        ngx.status = 503
        ngx.say("No available API keys")
        ngx.exit(503)
        return nil
    end

    -- 设置新的API Key
    ngx.var.new_api_key = new_key

    -- 记录API keys到变量用于日志
    ngx.var.api_key = old_key
    ngx.var.real_api_key_used = new_key

    return new_key
end

function _M.init_allowed_keys()
    -- 初始化允许的API keys到共享内存
    local dict = ngx.shared.api_keys
    for key, _ in pairs(config.config.allowed_keys) do
        dict:set(key, true)
    end
end

return _M