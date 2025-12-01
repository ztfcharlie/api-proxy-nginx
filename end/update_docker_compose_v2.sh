#!/bin/bash

# 批量更新 docker-compose 命令为 docker compose (V2 语法)

echo "=========================================="
echo "更新 Docker Compose 命令为 V2 语法"
echo "=========================================="
echo ""

# 要更新的文件列表
files=(
    "CHANGELOG.md"
    "SUMMARY.md"
    "DEPLOY_SCRIPT_USAGE.md"
    "README_DEPLOYMENT.md"
    "QUICK_START.md"
    "FILES_TO_UPLOAD.txt"
    "PRE_DEPLOYMENT_CHECKLIST.md"
    "SERVER_DEPLOYMENT.md"
    "DEPLOYMENT_GUIDE.md"
    "TESTING_CHECKLIST.md"
    "test_lua_modules.sh"
    "data/map/README-NEW-CONFIG.md"
    "test-new-config.sh"
    "README.md"
)

count=0

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "更新: $file"
        # 使用 sed 替换 docker-compose 为 docker compose
        sed -i 's/docker-compose/docker compose/g' "$file"
        count=$((count + 1))
    else
        echo "跳过: $file (文件不存在)"
    fi
done

echo ""
echo "=========================================="
echo "完成！共更新 $count 个文件"
echo "=========================================="
echo ""
echo "注意事项："
echo "1. Docker Compose V2 已集成到 Docker CLI 中"
echo "2. 命令格式: docker compose (空格，不是连字符)"
echo "3. 兼容性: Docker 20.10+ 支持 V2"
echo ""
echo "验证安装："
echo "  docker compose version"
