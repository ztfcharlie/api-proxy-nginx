#!/bin/bash

# Lua模块测试脚本

echo "=== Testing Lua Modules ==="

# 1. 测试每个Lua模块是否可以加载
echo "1. Testing individual Lua modules..."

docker-compose exec api-proxy-nginx lua -e "
-- 设置包路径
package.path = '/usr/local/openresty/nginx/lua/?.lua;' .. package.path

-- 测试config模块
print('Testing config.lua...')
local ok, config = pcall(require, 'config')
if ok then
    print('✓ config.lua loaded successfully')
    -- 测试配置函数
    if type(config.get_paths) == 'function' then
        print('  ✓ get_paths function exists')
    end
    if type(config.is_loaded) == 'function' then
        print('  ✓ is_loaded function exists')
    end
else
    print('✗ config.lua failed: ' .. tostring(config))
end

print('')

-- 测试utils模块
print('Testing utils.lua...')
local ok, utils = pcall(require, 'utils')
if ok then
    print('✓ utils.lua loaded successfully')
    -- 测试工具函数
    if type(utils.generate_request_id) == 'function' then
        print('  ✓ generate_request_id function exists')
        local id = utils.generate_request_id()
        print('  ✓ Generated request ID: ' .. tostring(id))
    end
    if type(utils.base64_encode) == 'function' then
        print('  ✓ base64_encode function exists')
    end
else
    print('✗ utils.lua failed: ' .. tostring(utils))
end

print('')

-- 测试auth_manager模块
print('Testing auth_manager.lua...')
local ok, auth_manager = pcall(require, 'auth_manager')
if ok then
    print('✓ auth_manager.lua loaded successfully')
    if type(auth_manager.authenticate_client) == 'function' then
        print('  ✓ authenticate_client function exists')
    end
    if type(auth_manager.get_api_host) == 'function' then
        print('  ✓ get_api_host function exists')
    end
else
    print('✗ auth_manager.lua failed: ' .. tostring(auth_manager))
end

print('')

-- 测试stream_handler模块
print('Testing stream_handler.lua...')
local ok, stream_handler = pcall(require, 'stream_handler')
if ok then
    print('✓ stream_handler.lua loaded successfully')
    if type(stream_handler.detect_streaming_request) == 'function' then
        print('  ✓ detect_streaming_request function exists')
    end
    if type(stream_handler.handle_streaming_response) == 'function' then
        print('  ✓ handle_streaming_response function exists')
    end
else
    print('✗ stream_handler.lua failed: ' .. tostring(stream_handler))
end
"

echo ""
echo "2. Testing Lua dependencies..."

docker-compose exec api-proxy-nginx lua -e "
-- 测试cjson
local ok, cjson = pcall(require, 'cjson')
if ok then
    print('✓ cjson library available')
    local test_data = {test = 'value'}
    local json_str = cjson.encode(test_data)
    local decoded = cjson.decode(json_str)
    print('  ✓ JSON encode/decode works: ' .. json_str)
else
    print('✗ cjson library not available: ' .. tostring(cjson))
end

-- 测试resty.http
local ok, http = pcall(require, 'resty.http')
if ok then
    print('✓ resty.http library available')
else
    print('✗ resty.http library not available: ' .. tostring(http))
end
"

echo ""
echo "3. Testing configuration file loading..."

docker-compose exec api-proxy-nginx lua -e "
package.path = '/usr/local/openresty/nginx/lua/?.lua;' .. package.path

local config = require('config')

-- 测试路径配置
local paths = config.get_paths()
if paths then
    print('✓ Configuration paths loaded:')
    for k, v in pairs(paths) do
        print('  ' .. k .. ': ' .. v)
    end
else
    print('✗ Failed to get configuration paths')
end

-- 测试配置加载状态
local loaded = config.is_loaded()
print('Configuration loaded status: ' .. tostring(loaded))
"

echo ""
echo "=== Lua Module Test Complete ==="