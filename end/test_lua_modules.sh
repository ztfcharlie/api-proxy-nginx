#!/bin/bash

# 在 Docker 容器中测试 Lua 模块

echo "=========================================="
echo "测试 Lua 模块（在容器中）"
echo "=========================================="
echo ""

# 检查容器是否运行
if ! docker compose ps | grep -q "api-proxy-nginx.*Up"; then
    echo "错误: api-proxy-nginx 容器未运行"
    echo "请先启动容器: docker compose up -d"
    exit 1
fi

echo "1. 测试配置文件语法"
echo "-------------------------------------------"
docker compose exec -T api-proxy-nginx nginx -t
if [ $? -eq 0 ]; then
    echo "✓ Nginx 配置语法正确"
else
    echo "✗ Nginx 配置语法错误"
    exit 1
fi
echo ""

echo "2. 测试 Lua 模块加载"
echo "-------------------------------------------"
docker compose exec -T api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
    package.path = '/etc/nginx/lua/?.lua;' .. package.path

    print('加载 config.lua...')
    local config = require 'config'
    print('✓ config.lua 加载成功')

    print('加载 utils.lua...')
    local utils = require 'utils'
    print('✓ utils.lua 加载成功')

    print('加载 auth_manager.lua...')
    local auth_manager = require 'auth_manager'
    print('✓ auth_manager.lua 加载成功')

    print('加载 stream_handler.lua...')
    local stream_handler = require 'stream_handler'
    print('✓ stream_handler.lua 加载成功')
"
if [ $? -eq 0 ]; then
    echo "✓ 所有 Lua 模块加载成功"
else
    echo "✗ Lua 模块加载失败"
    exit 1
fi
echo ""

echo "3. 测试配置初始化"
echo "-------------------------------------------"
docker compose exec -T api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
    package.path = '/etc/nginx/lua/?.lua;' .. package.path

    local config = require 'config'

    print('初始化配置...')
    config.init()

    if config.is_loaded() then
        print('✓ 配置加载成功')
    else
        print('✗ 配置加载失败')
        os.exit(1)
    end

    print('')
    print('测试获取客户端配置...')
    local client_config = config.get_client_config('gemini-client-key-aaaa')
    if client_config then
        print('✓ 找到客户端配置: gemini-client-key-aaaa')
        print('  启用状态:', client_config.enable)
    else
        print('✗ 未找到客户端配置')
        os.exit(1)
    end

    print('')
    print('测试获取客户端状态...')
    local status = config.get_client_status('gemini-client-key-aaaa')
    if status == 'enable' then
        print('✓ 客户端状态正确: enable')
    else
        print('✗ 客户端状态错误:', status)
        os.exit(1)
    end

    print('')
    print('测试获取服务账号列表...')
    local key_files, err = config.get_client_key_files('gemini-client-key-aaaa')
    if key_files then
        print('✓ 找到服务账号列表')
        print('  数量:', #key_files)
        for i, kf in ipairs(key_files) do
            print('  [' .. i .. '] 文件:', kf.key_filename, '权重:', kf.key_weight)
        end
    else
        print('✗ 未找到服务账号列表:', err)
        os.exit(1)
    end

    print('')
    print('测试获取模型域名...')
    local domain = config.get_model_domain('hulaoban-202504.json', 'gemini-3-pro-preview')
    if domain then
        print('✓ 找到模型域名:', domain)
    else
        print('✗ 未找到模型域名')
        os.exit(1)
    end
"
if [ $? -eq 0 ]; then
    echo ""
    echo "✓ 配置测试通过"
else
    echo ""
    echo "✗ 配置测试失败"
    exit 1
fi
echo ""

echo "4. 测试工具函数"
echo "-------------------------------------------"
docker compose exec -T api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
    package.path = '/etc/nginx/lua/?.lua;' .. package.path

    local config = require 'config'
    config.init()

    local utils = require 'utils'

    print('测试提取模型名称...')
    local uri = '/v1/projects/test/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent'
    local model = utils.extract_model_name(uri)
    if model == 'gemini-3-pro-preview' then
        print('✓ 模型名称提取正确:', model)
    else
        print('✗ 模型名称提取错误:', model)
        os.exit(1)
    end

    print('')
    print('测试 Token 过期检查...')
    local now = os.time()
    local valid_token = {
        access_token = 'test',
        expires_at = now + 3600
    }
    local is_expired = utils.is_token_expired(valid_token, 300)
    if not is_expired then
        print('✓ Token 过期检查正确（未过期）')
    else
        print('✗ Token 过期检查错误')
        os.exit(1)
    end

    local expired_token = {
        access_token = 'test',
        expires_at = now - 100
    }
    local is_expired2 = utils.is_token_expired(expired_token, 300)
    if is_expired2 then
        print('✓ Token 过期检查正确（已过期）')
    else
        print('✗ Token 过期检查错误')
        os.exit(1)
    end
"
if [ $? -eq 0 ]; then
    echo ""
    echo "✓ 工具函数测试通过"
else
    echo ""
    echo "✗ 工具函数测试失败"
    exit 1
fi
echo ""

echo "=========================================="
echo "✓ 所有模块测试通过！"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 重启容器以应用新配置: docker compose restart api-proxy-nginx"
echo "2. 查看日志: docker compose logs -f api-proxy-nginx"
echo "3. 测试 API: ./test-new-config.sh"
