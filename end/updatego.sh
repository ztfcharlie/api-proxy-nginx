#!/bin/bash

# 定义要创建的目录列表
docker-compose -f docker-compose-base-service.yml down api-proxy-log-processor
cd ../
git pull
cd end
docker-compose -f docker-compose-base-service.yml up -d --build --no-deps api-proxy-log-processor