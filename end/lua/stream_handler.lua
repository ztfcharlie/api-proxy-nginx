local config = require "config"
local utils = require "utils"
local _M = {}

-- 检测是否为流式请求
function _M.detect_streaming_request()
    local uri = ngx.var.request_uri
    local method = ngx.var.request_method
    local accept_header = ngx.var.http_accept

    -- 检查 URL 中是否包含 stream 相关字段
    local is_stream_url = uri:match(":stream") or uri:match("stream")

    -- 检查 Accept 头部
    local is_stream_accept = accept_header and accept_header:match("text/event%-stream")

    -- 检查请求体中的 stream 参数（需要读取请求体）
    local is_stream_body = false
    if method == "POST" then
        ngx.req.read_body()
        local body_data = ngx.req.get_body_data()
        if body_data then
            local ok, body_json = pcall(require("cjson").decode, body_data)
            if ok and body_json and body_json.stream then
                is_stream_body = true
            end
        end
    end

    local is_streaming = is_stream_url or is_stream_accept or is_stream_body

    if config.should_test_output("request_headers") then
        ngx.log(ngx.INFO, "[TEST] Stream detection - URL: ", tostring(is_stream_url),
                ", Accept: ", tostring(is_stream_accept),
                ", Body: ", tostring(is_stream_body),
                ", Final: ", tostring(is_streaming))
    end

    return is_streaming
end

-- 处理流式响应
function _M.handle_streaming_response()
    local chunk = ngx.arg[1]
    local eof = ngx.arg[2]

    -- 如果是数据块，直接转发
    if chunk and #chunk > 0 then
        -- 对于SSE格式，确保数据格式正确
        local uri = ngx.var.request_uri
        if uri and uri:match("alt=sse") then
            chunk = _M.process_sse_data(chunk)
        end

        -- 实时转发数据块，不进行缓冲
        ngx.arg[1] = chunk

        if config.should_log("debug") then
            ngx.log(ngx.DEBUG, "[STREAM] Forwarding chunk of size: ", #chunk)
        end
    end

    -- 如果是流结束
    if eof then
        if config.should_log("info") then
            ngx.log(ngx.INFO, "[STREAM] Stream ended for request: ", ngx.var.request_id)
        end
    end
end

-- 设置流式响应头部
function _M.set_streaming_headers()
    -- 明确移除可能导致问题的头部
    ngx.header["Content-Disposition"] = nil

    -- 设置流式响应相关头部
    ngx.header["Cache-Control"] = "no-cache, no-store, must-revalidate"
    ngx.header["Pragma"] = "no-cache"
    ngx.header["Expires"] = "0"
    ngx.header["Connection"] = "keep-alive"
    ngx.header["X-Accel-Buffering"] = "no"

    if config.should_log("info") then
        ngx.log(ngx.INFO, "[STREAM] Set streaming headers for request: ", ngx.var.request_id)
    end
end

-- 处理流式连接中断
function _M.handle_stream_disconnect()
    if ngx.var.request_completion ~= "OK" then
        ngx.log(ngx.WARN, "[STREAM] Client disconnected during streaming: ", ngx.var.request_id)

        -- 可以在这里添加清理逻辑
        -- 例如：通知上游服务器停止生成内容
    end
end

-- 检查流式连接健康状态
function _M.check_stream_health()
    local request_time = tonumber(ngx.var.request_time) or 0
    local max_stream_time = config.get_app_config().timeouts.proxy_read or 300

    if request_time > max_stream_time then
        ngx.log(ngx.WARN, "[STREAM] Long running stream detected: ",
                request_time, "s for request: ", ngx.var.request_id)
    end
end

-- 处理 SSE 格式数据
function _M.process_sse_data(chunk)
    if not chunk or #chunk == 0 then
        return chunk
    end

    if config.should_log("debug") then
        ngx.log(ngx.DEBUG, "[SSE] Processing chunk: ", utils.truncate_string(chunk, 200))
    end

    -- 对于SSE格式，直接返回原始数据
    -- Google API已经返回正确格式的SSE数据，不需要额外处理
    return chunk
end

-- 处理流式错误
function _M.handle_streaming_error(error_msg)
    ngx.log(ngx.ERR, "[STREAM] Streaming error: ", error_msg, " for request: ", ngx.var.request_id)

    -- 发送 SSE 错误事件
    local error_event = "event: error\ndata: " .. utils.safe_concat('{"error":"', error_msg, '"}') .. "\n\n"
    ngx.print(error_event)
    ngx.flush(true)
end

-- 初始化流式处理
function _M.init_streaming()
    -- 设置流式响应头部
    _M.set_streaming_headers()

    -- 禁用缓冲
    ngx.ctx.buffering_disabled = true

    if config.should_log("info") then
        ngx.log(ngx.INFO, "[STREAM] Initialized streaming for request: ", ngx.var.request_id)
    end
end

-- 完成流式处理
function _M.finalize_streaming()
    -- 检查连接状态
    _M.handle_stream_disconnect()

    -- 检查流健康状态
    _M.check_stream_health()

    if config.should_log("info") then
        ngx.log(ngx.INFO, "[STREAM] Finalized streaming for request: ", ngx.var.request_id)
    end
end

-- 流式请求的特殊配置
function _M.configure_streaming_proxy()
    -- 这些配置应该在 nginx 配置中设置，这里仅作为参考
    --[[
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
    chunked_transfer_encoding on;
    --]]

    if config.should_test_output("upstream_headers") then
        ngx.log(ngx.INFO, "[TEST] Streaming proxy configuration applied for request: ", ngx.var.request_id)
    end
end

-- 监控流式传输性能
function _M.monitor_streaming_performance()
    local start_time = ngx.ctx.stream_start_time or ngx.now()
    local current_time = ngx.now()
    local duration = current_time - start_time

    -- 记录流式传输统计信息
    if duration > 10 then -- 超过10秒的流
        ngx.log(ngx.INFO, "[STREAM] Long streaming session: ",
                duration, "s for request: ", ngx.var.request_id)
    end

    -- 可以在这里添加更多性能监控逻辑
    -- 例如：数据传输量、传输速率等
end

return _M