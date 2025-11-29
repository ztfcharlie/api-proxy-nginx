#!/bin/bash

# 定义要创建的目录列表
docker compose down
cd ../
git pull
cd end
docker compose up -d --build