#!/bin/bash

# API Proxy Startup Script

echo "Starting API Proxy..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Warning: .env file not found. Please copy .env.example to .env and configure your API keys."
    echo "cp .env.example .env"
    exit 1
fi

# Check if GEMINI_API_KEY is set
source .env
if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" = "your-google-gemini-api-key-here" ]; then
    echo "Error: GEMINI_API_KEY is not configured in .env file"
    echo "Please set your Google Gemini API key in the .env file"
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Start the services
echo "Starting Docker Compose services..."
docker-compose up -d

# Wait a moment for services to start
sleep 5

# Check service status
echo "Checking service status..."
docker-compose ps

# Show logs
echo "Showing recent logs..."
docker-compose logs --tail=20

echo ""
echo "API Proxy is starting up!"
echo "Health check: curl http://localhost:8888/health"
echo "Test endpoint: curl http://localhost:8888/v1beta/models/gemini-embedding-001:embedContent"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop: docker-compose down"