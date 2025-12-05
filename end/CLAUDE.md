# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **OpenResty AI Proxy Service** that provides unified access to multiple AI services (Google Vertex AI, Claude API) with OAuth2 authentication, dynamic routing, and privacy protection. The system consists of:

- **OpenResty Proxy** (Port 8888/8443): Nginx + Lua-based API proxy
- **Node.js OAuth2 Mock Service** (Port 8889): OAuth2 authentication simulation
- **MySQL Database**: Persistent storage for clients, tokens, and logs
- **Redis Cache**: Token caching and session storage

## Development Commands

### Initial Setup

```bash
# Create required directories and set permissions
chmod +x init.sh && ./init.sh
chmod -R 755 data logs config redis-data mysql-data tmp/oauth2

# Create Docker network
docker network create api-proxy-network
```

### Starting Services

```bash
# Start base services (MySQL, Redis)
docker-compose -f docker-compose-base-service.yml up -d

# Start Node.js OAuth2 service
cd nodejs
npm install
copy .env.example .env  # Edit .env with your configuration
npm run dev              # Development mode with nodemon
# OR
docker-compose up -d     # Production mode with Docker

# Start main proxy service
cd ..
docker-compose up -d

# Check service status
docker-compose ps
```

### Node.js Development

```bash
cd nodejs

# Development mode
npm run dev

# Production mode
npm start

# PM2 process management
npm run pm2:start    # Start with PM2
npm run pm2:stop     # Stop PM2
npm run pm2:restart  # Restart PM2
```

### Database Operations

```bash
# Access MySQL
mysql -h localhost -P 3306 -u root -p

# Access database directly
mysql -h localhost -P 3306 -u oauth2_user -p oauth2_mock

# Import schema (if needed)
mysql -u root -p oauth2_mock < database/schema.sql
```

### Redis Operations

```bash
# Access Redis
redis-cli -h localhost -p 6379 -a 123456

# Monitor Redis
redis-cli -h localhost -p 6379 -a 123456 monitor
```

## Architecture

### Core Components

1. **OpenResty Proxy Layer** (`nginx/`, `lua/`)
   - Entry point for all AI API requests
   - Handles authentication via Lua scripts
   - Routes requests to appropriate AI services
   - Manages token caching in Redis

2. **Node.js OAuth2 Service** (`nodejs/`)
   - Mocks Google OAuth2 endpoints for testing
   - Provides web admin interface at `/admin`
   - Manages service account credentials
   - Handles token mapping and caching

3. **Data Layer**
   - MySQL: Persistent storage (clients, accounts, logs)
   - Redis: In-memory cache (tokens, sessions)

### Key Configuration Files

- `docker-compose.yml`: Main proxy service configuration
- `docker-compose-base-service.yml`: MySQL and Redis services
- `nodejs/package.json`: Node.js dependencies and scripts
- `config/app_config.json`: Runtime configuration
- `data/map/map-config.json`: Client and service routing
- `nginx/nginx.conf`: OpenResty configuration
- `nginx/conf.d/gemini-proxy.conf`: API proxy routing rules

### Service URLs

- **API Proxy**: http://localhost:8888 (HTTP) or https://localhost:8443 (HTTPS)
- **OAuth2 Service**: http://localhost:8889
- **Admin Console**: http://localhost:8889/admin/
- **Health Check**: http://localhost:8889/health

## Data Flow

```
Client Request → OpenResty Proxy → Authentication Check → Token Mapping →
AI Service (Google/Claude) → Response → Return to Client
```

1. Client sends AI API request to OpenResty (port 8888)
2. Lua scripts validate authentication tokens
3. OAuth2 service (port 8889) provides token mapping
4. Request forwarded to appropriate AI service
5. Response returned through proxy chain

## Working with OAuth2 Service

### Environment Configuration

The Node.js service uses `.env` file for configuration. Copy `.env.example` and modify:

```env
NODE_ENV=development
PORT=8889
DB_HOST=localhost
DB_PORT=3306
DB_NAME=oauth2_mock
DB_USER=oauth2_user
DB_PASSWORD=oauth2_password_123456
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=123456
```

### API Endpoints

The OAuth2 service provides these mock endpoints:
- `POST /accounts.google.com/oauth2/token` - Token exchange
- `GET /accounts.google.com/oauth2/v1/certs` - OAuth2 certificates
- `GET /health` - Health check
- `/admin/*` - Management interface APIs

### Adding New Service Accounts

Service accounts are stored in `data/json/` as JSON files. Each file contains Google service account credentials that the OAuth2 service uses for authentication.

## Lua Module Development

When modifying Lua scripts in `lua/` directory:

- Restart the proxy service: `docker-compose restart api-proxy-nginx`
- Check logs: `docker-compose logs -f api-proxy-nginx`
- Lua modules are loaded by OpenResty on startup

## Testing the System

### Test OAuth2 Flow

```bash
# Test token endpoint
curl -X POST http://localhost:8889/accounts.google.com/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=test&client_secret=test"

# Test health check
curl http://localhost:8889/health
```

### Test Proxy Functionality

```bash
# Test AI API through proxy
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8888/v1/models/gemini-pro:generateContent
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Check if ports 3306, 6379, 8888, 8889 are available
2. **Database connection**: Verify MySQL credentials and database exists
3. **Redis connection**: Ensure Redis is running and accessible
4. **Token validation**: Check service account credentials in `data/json/`

### Log Locations

- OpenResty logs: `logs/` directory
- Node.js logs: Console output or PM2 logs
- MySQL logs: Docker container logs
- Redis logs: Docker container logs

### Viewing Logs

```bash
# Docker logs
docker-compose logs -f api-proxy-nginx
docker-compose logs -f api-proxy-nodejs

# PM2 logs (if using PM2)
cd nodejs && pm2 logs oauth2-mock
```

## Important Notes

- The OAuth2 service is a **mock** for development/testing only
- Production deployments should use real Google OAuth2 endpoints
- All services communicate through Docker network `api-proxy-network`
- Token mappings are cached in Redis for performance
- Configuration changes require service restarts