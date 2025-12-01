#!/bin/bash

# 使用 Docker 运行 Lua 单元测试

echo "=========================================="
echo "使用 Docker 运行 Lua 单元测试"
echo "=========================================="
echo ""

# 检查 Docker 是否运行
if ! docker info &> /dev/null; then
    echo "错误: Docker 未运行"
    exit 1
fi

# 使用 OpenResty 镜像运行测试
echo "拉取 OpenResty 镜像..."
docker pull openresty/openresty:alpine-fat

echo ""
echo "运行测试..."
echo ""

# 运行测试容器
docker run --rm \
    -v "$(pwd)/../lua:/app/lua:ro" \
    -v "$(pwd)/../data:/app/data:ro" \
    -v "$(pwd)/../config:/app/config:ro" \
    -v "$(pwd):/app/tests:ro" \
    -w /app/tests \
    openresty/openresty:alpine-fat \
    sh -c '
        # 安装 lua-cjson（如果需要）
        apk add --no-cache lua5.1-cjson 2>/dev/null || true

        echo "=========================================="
        echo "测试 1: utils.lua"
        echo "=========================================="
        echo ""
        /usr/local/openresty/luajit/bin/luajit test_utils.lua
        TEST1=$?

        echo ""
        echo "=========================================="
        echo "测试 2: config.lua"
        echo "=========================================="
        echo ""
        /usr/local/openresty/luajit/bin/luajit test_config.lua
        TEST2=$?

        echo ""
        echo "=========================================="
        echo "测试总结"
        echo "=========================================="

        if [ $TEST1 -eq 0 ] && [ $TEST2 -eq 0 ]; then
            echo "✓ 所有测试通过！"
            exit 0
        else
            echo "✗ 有测试失败"
            exit 1
        fi
    '

exit $?
