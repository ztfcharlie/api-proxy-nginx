-- 最小的 OpenSSL x509 chain 兼容模块
-- 只提供 lua-resty-http 需要的基本接口

local _M = {}

-- 空的构造函数，返回一个空对象
function _M.new()
    return setmetatable({}, {__index = _M})
end

-- 空的验证函数，总是返回 true（跳过 mTLS 验证）
function _M:verify(cert, ca_certs, opts)
    return true
end

-- 空的添加证书函数
function _M:add(cert)
    return true
end

return _M