-- 最小的 OpenSSL SSL 兼容模块

local _M = {}

-- 空的 SSL 上下文构造函数
function _M.new()
    return setmetatable({}, {__index = _M})
end

-- 空的配置函数
function _M:set_verify(mode)
    return true
end

function _M:set_cert(cert)
    return true
end

function _M:set_key(key)
    return true
end

return _M