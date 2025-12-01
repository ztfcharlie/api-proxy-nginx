-- 最小化版本的auth_manager.lua，仅用于测试nginx启动
local _M = {}

-- 简化的客户端认证函数
function _M.authenticate_client()
    ngx.log(ngx.INFO, "Minimal auth_manager: authenticate_client called")
    -- 返回测试数据
    return "test-client-token", "test-access-token", "test-key.json"
end

-- 简化的API主机获取函数
function _M.get_api_host(key_filename, model_name)
    ngx.log(ngx.INFO, "Minimal auth_manager: get_api_host called")
    -- 返回默认的API主机
    return "generativelanguage.googleapis.com"
end

return _M