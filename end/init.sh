#!/bin/bash

# 定义要创建的目录列表
directories=(
    "redis-data"
    "nginx"
    "nginx/conf.d"
    "nginx/oauth2_certs"
    "lua"
    "logs"
    "html"
    "ssl"
    "data"
    "config"
    "redis"
    "data/json"
    "data/jwt"
    "data/map"
    "data/client"
    "mysql-data"
    "nodejs/logs"
    "nodejs/tmp"
)

# 创建目录
echo "开始创建目录..."
for dir in "${directories[@]}"; do
    mkdir -p "$dir"
    echo "已创建: $dir"
done

# 授予权限
echo "开始授予权限..."
chmod -R 777 redis-data nginx lua logs html ssl data config redis mysql-data nodejs/logs tmp nodejs/tmp
echo "已授予所有目录777权限"

echo "完成！所有目录已创建并授权"
