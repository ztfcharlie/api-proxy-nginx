#!/bin/bash
echo "Updating Go Gateway..."
docker-compose -f docker-compose.yml up -d --build --no-deps api-proxy-gateway
