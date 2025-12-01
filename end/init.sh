#!/bin/bash

# 定义要创建的目录列表
directories=(
    "redis-data"
    "nginx-logs"
    "nginx"
    "nginx/conf.d"
    "lua"
    "logs"
    "html"
    "ssl"
    "data"
    "config"
    "redis"
)

# 创建目录
echo "开始创建目录..."
for dir in "${directories[@]}"; do
    mkdir -p "$dir"
    echo "已创建: $dir"
done

# 授予权限
echo "开始授予权限..."
chmod -R 777 redis-data nginx lua logs html ssl data config
echo "已授予所有目录777权限"

echo "完成！所有目录已创建并授权"
