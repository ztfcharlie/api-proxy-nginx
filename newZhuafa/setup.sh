#!/bin/bash

echo "=== Vertex AI API 代理设置向导 ==="
echo ""

# 检查是否存在 service-account.json 文件
if [ -f "service-account.json" ]; then
    echo "✅ 发现现有的 service-account.json 文件"

    # 检查是否是模板文件
    if grep -q "your-project-id" service-account.json; then
        echo "⚠️  当前文件似乎是模板文件，需要替换为真实内容"
        NEED_SETUP=true
    else
        echo "✅ 文件内容看起来已经配置好了"
        NEED_SETUP=false
    fi
else
    echo "❌ 未找到 service-account.json 文件"
    NEED_SETUP=true
fi

if [ "$NEED_SETUP" = true ]; then
    echo ""
    echo "📋 设置步骤："
    echo "1. 复制模板文件："
    echo "   cp service-account.json.example service-account.json"
    echo ""
    echo "2. 编辑 service-account.json 文件："
    echo "   nano service-account.json"
    echo "   # 或使用你喜欢的编辑器"
    echo ""
    echo "3. 将你的 Vertex AI JSON key 内容完整粘贴到文件中"
    echo ""
    echo "4. 启动服务："
    echo "   docker-compose build && docker-compose up -d"
    echo ""

    read -p "是否现在复制模板文件? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp service-account.json.example service-account.json
        echo "✅ 已复制模板文件到 service-account.json"
        echo "📝 请编辑此文件并粘贴你的 Vertex AI JSON key 内容"
        echo ""
        echo "编辑文件: nano service-account.json"
    fi
else
    echo ""
    echo "🚀 配置看起来已经完成，可以直接启动服务："
    echo "   docker-compose build && docker-compose up -d"
    echo ""
    echo "🧪 或运行测试："
    echo "   ./test-oauth2.sh"
fi

echo ""
echo "📁 重要文件位置："
echo "   - 服务账号配置: ./service-account.json"
echo "   - Docker 配置: ./docker-compose.yaml"
echo "   - 日志目录: ./logs/"
echo ""
echo "📖 更多信息请查看 README.md"