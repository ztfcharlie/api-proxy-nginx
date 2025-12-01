#!/bin/bash

# 运行所有 Lua 单元测试

echo "=========================================="
echo "运行 Lua 单元测试"
echo "=========================================="
echo ""

# 检查 lua 是否安装
if ! command -v lua &> /dev/null; then
    echo "错误: 未找到 lua 命令"
    echo "请安装 Lua 5.1 或更高版本"
    echo ""
    echo "在 Ubuntu/Debian 上安装:"
    echo "  sudo apt-get install lua5.1 liblua5.1-dev luarocks"
    echo "  sudo luarocks install lua-cjson"
    echo ""
    echo "在 macOS 上安装:"
    echo "  brew install lua luarocks"
    echo "  luarocks install lua-cjson"
    echo ""
    exit 1
fi

# 检查 cjson 是否安装
lua -e "require 'cjson'" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "错误: 未找到 lua-cjson 模块"
    echo "请安装: luarocks install lua-cjson"
    echo ""
    exit 1
fi

cd "$(dirname "$0")"

# 测试计数
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 运行单个测试
run_test() {
    local test_file=$1
    local test_name=$(basename "$test_file" .lua)

    echo "=========================================="
    echo "运行测试: $test_name"
    echo "=========================================="
    echo ""

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if lua "$test_file"; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo ""
        echo "✓ $test_name 测试通过"
        echo ""
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo ""
        echo "✗ $test_name 测试失败"
        echo ""
        return 1
    fi
}

# 运行所有测试
echo "开始运行测试..."
echo ""

run_test "test_utils.lua"
run_test "test_config.lua"

# 输出总结
echo "=========================================="
echo "测试总结"
echo "=========================================="
echo "总测试数: $TOTAL_TESTS"
echo "通过: $PASSED_TESTS"
echo "失败: $FAILED_TESTS"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo "✓ 所有测试通过！"
    exit 0
else
    echo "✗ 有测试失败"
    exit 1
fi
