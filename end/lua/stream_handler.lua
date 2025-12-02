local config = require "config"
local utils = require "utils"
local cjson = require "cjson"
local _M = {}

-- 检测是否为流式请求
function _M.detect_streaming_request()
    local uri = ngx.var.request_uri
    local method = ngx.var.request_method
    local accept_header = ngx.var.http_accept

    -- 检查 URL 中是否包含 stream 相关字段
    local is_stream_url = uri:match(":stream") or uri:match("stream")

    -- 检查是否请求 SSE 格式
    local is_sse_param = uri and uri:match("alt=sse")
    local is_sse_accept = accept_header and accept_header:match("text/event%-stream")
    
    -- [修改] 强制禁用 SSE 模式转换
    -- 我们现在选择“透传”策略，即使客户端请求 SSE，我们也原样返回 Google 的 JSON
    -- 这样可以避免 Lua 解析错误，但要求客户端能处理 application/json 类型的流
    if is_sse_param or is_sse_accept then
        ngx.ctx.is_sse_mode = false -- 强制设为 false
    end

    -- 检查请求体中的 stream 参数
    local is_stream_body = false
    if method == "POST" then
        ngx.req.read_body()
        local body_data = ngx.req.get_body_data()
        if body_data then
            local ok, body_json = pcall(cjson.decode, body_data)
            if ok and body_json and body_json.stream then
                is_stream_body = true
            end
        end
    end

    local is_streaming = is_stream_url or is_sse_accept or is_stream_body

    if config.should_test_output("request_headers") then
        ngx.log(ngx.INFO, "[TEST] Stream detection - Is Streaming: ", tostring(is_streaming), 
                ", SSE Mode: ", tostring(ngx.ctx.is_sse_mode))
    end

    return is_streaming
end

-- 设置流式响应头部
function _M.set_streaming_headers()
    -- 检查上游是否返回了压缩数据
    local content_encoding = ngx.header["Content-Encoding"]
    if content_encoding and content_encoding ~= "" then
        if config.should_log("warn") then
            ngx.log(ngx.WARN, "[STREAM] Upstream returned compressed data (", content_encoding, "), disabling SSE conversion.")
        end
        -- 强制禁用 SSE 模式，因为我们无法处理压缩的 Body
        ngx.ctx.is_sse_mode = false
    end

    -- 移除可能导致问题的头部
    ngx.header["Content-Disposition"] = nil

    -- 基础流式头部
    ngx.header["Cache-Control"] = "no-cache, no-store, must-revalidate"
    ngx.header["Pragma"] = "no-cache"
    ngx.header["Expires"] = "0"
    ngx.header["Connection"] = "keep-alive"
    ngx.header["X-Accel-Buffering"] = "no"

    -- 如果是 SSE 模式，强制设置 Content-Type
    if ngx.ctx.is_sse_mode then
        ngx.header["Content-Type"] = "text/event-stream; charset=utf-8"
        ngx.header["Access-Control-Allow-Origin"] = "*"
        
        if config.should_log("info") then
            ngx.log(ngx.INFO, "[STREAM] Set SSE headers (text/event-stream) for request: ", ngx.var.request_id)
        end
    else
        -- 非 SSE 模式，保留 Google 原生 Content-Type (通常是 application/json)
        if config.should_log("info") then
            ngx.log(ngx.INFO, "[STREAM] Keeping upstream Content-Type for request: ", ngx.var.request_id)
        end
    end
end

-- 辅助函数：查找 JSON 对象结束位置（简单的括号计数）
local function find_json_end(str)
    local open_braces = 0
    local in_string = false
    local escaped = false
    
    for i = 1, #str do
        local char = str:sub(i, i)
        if not in_string then
            if char == '{' then
                open_braces = open_braces + 1
            elseif char == '}' then
                open_braces = open_braces - 1
                if open_braces == 0 then
                    return i
                end
            elseif char == '"' then
                in_string = true
            end
        else
            if char == '\\' then
                escaped = not escaped
            elseif char == '"' and not escaped then
                in_string = false
            else
                escaped = false
            end
        end
    end
    return nil
end

-- 处理流式响应主体
function _M.handle_streaming_response()
    local chunk = ngx.arg[1]
    local eof = ngx.arg[2]

    -- [调试侦听] 记录 Google 返回的原始数据块
    if chunk and #chunk > 0 then
        -- 使用 truncate_string 防止日志过长，但保留足够长度以看清格式
        -- 注意：这里使用 ERR 级别确保一定能看到日志，同时加上请求ID
        ngx.log(ngx.ERR, "[RAW-STREAM-DEBUG][" .. tostring(ngx.var.request_id) .. "] Chunk received (len=" .. #chunk .. "): " .. utils.truncate_string(chunk, 500))
    end

    -- 如果不是 SSE 模式，直接透传，不做任何处理
    if not ngx.ctx.is_sse_mode then
        if config.should_log("debug") and chunk then
            ngx.log(ngx.DEBUG, "[STREAM] Passthrough chunk size: ", #chunk)
        end
        return
    end

    -- SSE 转换逻辑 (目前已被禁用，is_sse_mode 恒为 false)
    if chunk and #chunk > 0 then
        -- ... (原有代码保持不变)
        -- 清空原始 chunk，我们将手动替换输出
        ngx.arg[1] = nil
        
        -- 获取并更新 buffer
        local buffer = (ngx.ctx.sse_buffer or "") .. chunk
        local output_data = ""
        
        -- 1. 移除流开头的 '['
        if buffer:match("^%s*%[") then
            buffer = buffer:gsub("^%s*%[", "")
        end
        
        -- 2. 循环提取完整 JSON 对象
        while true do
            -- 移除对象之间的逗号和空白
            buffer = buffer:gsub("^%s*,%s*", "")
            
            -- 检查是否到达流结尾 ']'
            if buffer:match("^%s*%]") then
                buffer = "" -- 结束
                break
            end
            
            -- 尝试找到一个完整的 JSON 对象
            if buffer:sub(1,1) == "{" then
                local obj_end = find_json_end(buffer)
                if obj_end then
                    local json_obj = buffer:sub(1, obj_end)
                    
                    -- 封装成 SSE 格式
                    output_data = output_data .. "data: " .. json_obj .. "\n\n"
                    
                    -- 移除已处理部分
                    buffer = buffer:sub(obj_end + 1)
                else
                    -- 数据不完整，等待下一个 chunk
                    break
                end
            else
                -- 如果遇到非期望字符（且不是空字符串）
                if #buffer > 0 and not buffer:match("^%s+$") then
                     break
                else
                    buffer = "" -- 只是空白
                    break
                end
            end
        end
        
        -- 保存未处理的 buffer
        ngx.ctx.sse_buffer = buffer
        
        -- 发送转换后的数据
        if #output_data > 0 then
            ngx.arg[1] = output_data
            if config.should_log("debug") then
                ngx.log(ngx.DEBUG, "[STREAM] Converted to SSE, size: ", #output_data)
            end
        end
    end
    
    if eof then
        if config.should_log("info") then
            ngx.log(ngx.INFO, "[STREAM] SSE Stream ended")
        end
    end
end

return _M