#!/bin/bash

echo "=== Nginx 配置语法检查 ==="

# 检查主配置文件语法
echo "1. 检查 nginx.conf 主配置..."
docker run --rm -v $(pwd)/nginx.conf:/test.conf:ro \
    -v $(pwd)/conf.d:/test_conf.d:ro \
    openresty/openresty:alpine \
    openresty -t -c /test.conf -g "conf.d /test_conf.d/*.conf;"

echo "2. 检查 Gemini proxy 配置文件..."

# 检查是否有重复的变量定义
echo "检查变量定义..."
echo "set 指令数量: $(grep -c '^.*set.*\$' conf.d/gemini-proxy.conf)"

echo "3. 列出所有 set 指令..."
grep -n 'set.*\$' conf.d/gemini-proxy.conf

echo "=== 检查完成 ==="