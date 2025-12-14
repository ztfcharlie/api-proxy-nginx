#!/bin/bash

# 定义要创建的目录列表
cd ../
git pull
cd end/nodejs
docker compose down
docker compose up -d --build
cd ../