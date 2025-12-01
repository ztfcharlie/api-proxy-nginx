#!/bin/bash

# 检查 Lua 代码语法（静态检查）

echo "=========================================="
echo "Lua 代码语法检查"
echo "=========================================="
echo ""

# 使用 luac 或 luajit 检查语法
check_syntax() {
    local file=$1
    local filename=$(basename "$file")

    echo -n "检查 $filename ... "

    # 尝试使用 Docker 运行 luajit 检查语法
    docker run --rm -v "$(pwd)/lua:/lua:ro" openresty/openresty:alpine-fat \
        /usr/local/openresty/luajit/bin/luajit -bl "/lua/$filename" > /dev/null 2>&1

    if [ $? -eq 0 ]; then
        echo "✓ 通过"
        return 0
    else
        echo "✗ 失败"
        # 显示详细错误
        docker run --rm -v "$(pwd)/lua:/lua:ro" openresty/openresty:alpine-fat \
            /usr/local/openresty/luajit/bin/luajit -bl "/lua/$filename" 2>&1
        return 1
    fi
}

echo "检查 Lua 模块语法..."
echo ""

FAILED=0

check_syntax "lua/config.lua" || FAILED=$((FAILED + 1))
check_syntax "lua/utils.lua" || FAILED=$((FAILED + 1))
check_syntax "lua/auth_manager.lua" || FAILED=$((FAILED + 1))
check_syntax "lua/stream_handler.lua" || FAILED=$((FAILED + 1))

echo ""
echo "=========================================="

if [ $FAILED -eq 0 ]; then
    echo "✓ 所有文件语法检查通过！"
    echo "=========================================="
    exit 0
else
    echo "✗ $FAILED 个文件语法检查失败"
    echo "=========================================="
    exit 1
fi
