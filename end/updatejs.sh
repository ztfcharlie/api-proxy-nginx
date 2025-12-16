#!/bin/bash
echo "Updating Node.js Service..."
docker-compose -f docker-compose.yml up -d --build --no-deps api-proxy-nodejs
