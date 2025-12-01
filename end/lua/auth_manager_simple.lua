-- 简化版auth_manager.lua用于测试
local cjson = require "cjson"
-- 暂时注释掉resty.http以测试其他部分
-- local http = require "resty.http"
local config = require "config"
local utils = require "utils"
local _M = {}

-- 共享内存缓存
local token_cache = ngx.shared.token_cache

-- 简化的客户端认证函数（用于测试）
function _M.authenticate_client()
    ngx.log(ngx.INFO, "Simple auth_manager: authenticate_client called")
    return "test-client", "test-token", "test-key.json"
end

-- 简化的API主机获取函数（用于测试）
function _M.get_api_host(key_filename, model_name)
    ngx.log(ngx.INFO, "Simple auth_manager: get_api_host called with ", key_filename, ", ", model_name)
    return "generativelanguage.googleapis.com"
end

return _M