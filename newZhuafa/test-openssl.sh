#!/bin/bash

echo "=== 测试 OpenSSL 模块安装 ==="
echo ""

# 清理并重新构建
echo "1. 清理并重新构建 (包含 OpenSSL 模块)..."
docker-compose down
docker-compose build --no-cache

if [ $? -ne 0 ]; then
    echo "   ❌ 构建失败"
    exit 1
fi

echo "   ✅ 构建成功"
echo ""

# 启动容器
echo "2. 启动容器..."
docker-compose up -d
sleep 5

# 检查容器状态
container_status=$(docker-compose ps --services --filter "status=running")
if [[ $container_status != *"api-proxy-nginx"* ]]; then
    echo "   ❌ 容器启动失败"
    docker-compose ps
    echo ""
    echo "   错误日志:"
    docker logs api-proxy-nginx
    exit 1
fi

echo "   ✅ 容器启动成功"
echo ""

# 检查 mTLS 警告是否消失
echo "3. 检查 mTLS 警告..."
mtls_warnings=$(docker logs api-proxy-nginx 2>&1 | grep -i "mTLS.*not.*supported" | wc -l)
openssl_errors=$(docker logs api-proxy-nginx 2>&1 | grep -i "resty.openssl.*not found" | wc -l)

if [ "$mtls_warnings" -eq 0 ] && [ "$openssl_errors" -eq 0 ]; then
    echo "   ✅ 没有 mTLS 或 OpenSSL 相关警告"
else
    echo "   ⚠️  仍有相关警告:"
    docker logs api-proxy-nginx 2>&1 | grep -i -E "(mTLS|openssl.*not found)" | head -3
fi
echo ""

# 测试模块加载
echo "4. 测试 OpenSSL 模块加载..."
docker exec api-proxy-nginx /usr/local/openresty/luajit/bin/luajit -e "
local success, openssl = pcall(require, 'resty.openssl')
if success then
    print('✅ resty.openssl 加载成功')
    print('   版本信息: ' .. (openssl.version or 'unknown'))
else
    print('❌ resty.openssl 加载失败: ' .. tostring(openssl))
end

-- 测试其他模块
local modules = {'resty.http', 'resty.jwt', 'resty.hmac'}
for _, module in ipairs(modules) do
    local ok, result = pcall(require, module)
    if ok then
        print('✅ ' .. module .. ' 加载成功')
    else
        print('❌ ' .. module .. ' 加载失败')
    end
end
"
echo ""

# 测试健康检查
echo "5. 测试健康检查..."
health_response=$(curl -s http://localhost:8888/health)
if [ "$health_response" = "OK" ]; then
    echo "   ✅ 健康检查通过: $health_response"
else
    echo "   ❌ 健康检查失败: $health_response"
fi
echo ""

# 检查所有日志中的错误
echo "6. 检查启动日志中的错误..."
error_count=$(docker logs api-proxy-nginx 2>&1 | grep -i "error" | wc -l)
if [ "$error_count" -eq 0 ]; then
    echo "   ✅ 没有错误日志"
else
    echo "   ⚠️  发现 $error_count 个错误:"
    docker logs api-proxy-nginx 2>&1 | grep -i "error" | head -3
fi
echo ""

# 显示安装的 OpenSSL 模块
echo "7. 显示安装的 OpenSSL 模块..."
echo "   OpenSSL 相关文件:"
docker exec api-proxy-nginx find /usr/local/openresty/lualib/resty/ -name "*openssl*" -type f | head -10
echo ""

echo "=== OpenSSL 测试完成 ==="

if [ "$health_response" = "OK" ] && [ "$mtls_warnings" -eq 0 ]; then
    echo "🎉 OpenSSL 模块安装成功，mTLS 警告已消除！"
    echo ""
    echo "下一步:"
    echo "1. 配置服务账号: cp service-account.json.example service-account.json"
    echo "2. 测试 OAuth2: ./test-oauth2.sh"
elif [ "$health_response" = "OK" ]; then
    echo "✅ 系统正常工作，但可能仍有一些警告"
    echo "   这不影响基本功能"
else
    echo "❌ 系统有问题，请检查上面的错误信息"
fi