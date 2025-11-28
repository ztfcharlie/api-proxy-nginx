local config = require "config"
local cjson = require "cjson"

local _M = {}

function _M.log_request()
    local log_config = config.config.logging

    -- 构建日志数据
    local log_data = {
        timestamp = ngx.localtime(),
        remote_addr = ngx.var.remote_addr,
        request_method = ngx.var.request_method,
        request_uri = ngx.var.request_uri,
        http_user_agent = ngx.var.http_user_agent,
        api_key = ngx.var.api_key or ngx.var.http_x_goog_api_key,
        request_time = ngx.var.request_time,
        status = ngx.var.status,
        upstream_status = ngx.var.upstream_status,
        upstream_addr = ngx.var.upstream_addr,
        request_id = ngx.var.request_id,
        real_api_key_used = ngx.var.real_api_key_used
    }

    -- 根据配置记录请求体
    if log_config.log_request_body then
        local request_body = ngx.var.request_body
        if request_body and request_body ~= "" then
            -- 限制请求体大小，避免日志过大
            if string.len(request_body) > 10000 then
                log_data.request_body = string.sub(request_body, 1, 10000) .. "...[truncated]"
            else
                log_data.request_body = request_body
            end
        end
    end

    -- 根据配置记录响应体
    if log_config.log_response_body then
        local response_body = ngx.var.response_body
        if response_body and response_body ~= "" then
            -- 限制响应体大小
            if string.len(response_body) > 10000 then
                log_data.response_body = string.sub(response_body, 1, 10000) .. "...[truncated]"
            else
                log_data.response_body = response_body
            end
        end
    end

    -- 转换为JSON并写入日志
    local log_line = cjson.encode(log_data)

    -- 写入日志文件
    local file = io.open(log_config.log_file, "a")
    if file then
        file:write(log_line .. "\n")
        file:close()
    end

    -- 同时写入Nginx错误日志（可选）
    ngx.log(ngx.INFO, "Gemini API Proxy: " .. log_line)
end

function _M.get_request_body()
    ngx.req.read_body()
    return ngx.var.request_body or ""
end

return _M