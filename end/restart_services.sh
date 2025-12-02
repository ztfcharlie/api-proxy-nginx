#!/bin/bash
echo "Restarting services to apply streaming fix..."
docker-compose restart api-proxy-nginx
echo "Services restarted."
