# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **OpenResty-based API proxy service** that forwards client requests to Google Vertex AI API (specifically Gemini models). The service acts as a secure middleware layer providing OAuth2 authentication, dynamic routing, request header modification, and privacy protection.

**Key Purpose**: Shield client IP addresses and location information from upstream APIs while providing seamless access to Google AI services through service account authentication.

## Architecture

### Multi-Service Setup
- **Main Service**: OpenResty proxy (ports 8080/8443)
- **Redis**: Caching and session storage (port 6379)
- **Optional Fluentd**: Log aggregation (logging profile)

### Directory Structure
```
D:\www\nginxzhuanfa\end\      # Project root directory (current location)
├── docker-compose.yml        # Multi-service orchestration
├── Dockerfile               # Container build configuration
├── start.sh                 # Startup script
├── test-api.sh             # API testing script
├── README.md               # Complete documentation
├── nginx/
│   ├── nginx.conf          # Main OpenResty configuration
│   └── conf.d/
│       └── gemini-proxy.conf # Proxy server configuration
├── lua/                    # Lua application modules
│   ├── config.lua         # Configuration management
│   ├── auth_manager.lua   # OAuth2 authentication
│   ├── stream_handler.lua # Streaming request handling
│   └── utils.lua          # Utility functions
├── config/
│   └── app_config.json    # Application configuration
├── data/                  # Configuration data
│   ├── json/             # Google service account credentials
│   ├── jwt/              # OAuth2 tokens cache
│   └── map/              # Configuration mappings
│       ├── map-client.json           # Client authorization
│       ├── map-client-json.json      # Client to credential mapping
│       └── map-json-model-region.json # Model to API endpoint mapping
├── html/                 # Static web files
├── logs/                 # Log files
└── ssl/                  # SSL certificates
```

## Core Functionality

### Authentication Flow
1. Client sends request with `X-Client-ID` header
2. System validates client against `data/map/map-client.json`
3. Maps client to Google service account via `data/map/map-client-json.json`
4. Generates/refreshes OAuth2 tokens using service account credentials
5. Replaces client auth headers with valid Google API tokens

### Dynamic Routing
- Extracts model name from request URL path (e.g., `gemini-3-pro-preview`)
- Uses `data/map/map-json-model-region.json` to determine target API endpoint
- Forwards requests to appropriate Google API servers

### Privacy Protection
- Removes client IP tracking headers (X-Forwarded-For, etc.)
- Ensures upstream APIs only see proxy server IP
- Configurable logging levels to control sensitive data exposure

## Development Commands

### Container Operations
```bash
# Start all services
docker-compose up -d

# Start with logging service
docker-compose --profile logging up -d

# View logs
docker-compose logs -f api-proxy-nginx

# Restart proxy service
docker-compose restart api-proxy-nginx

# Stop all services
docker-compose down
```

### Configuration Management
```bash
# Test nginx configuration syntax
./test-nginx-syntax.sh

# Check service health
./check-services.sh

# Initialize project
./init.sh
```

### Development Testing
```bash
# Test health endpoint
curl http://localhost:8888/health

# Test API proxy (requires valid client ID)
curl -X POST http://localhost:8888/v1/projects/PROJECT_ID/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent \
  -H "X-Client-ID: client-key-aaaa" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "Hello"}]}]}'
```

## Configuration Files

### Core Mappings (in `end/data/map/`)
- **`map-client.json`**: Client authorization list (`"client-id": "enable/disable"`)
- **`map-client-json.json`**: Client to service account mapping (`"client-id": "credential-file.json"`)
- **`map-json-model-region.json`**: Model to API endpoint mapping

### Service Account Credentials (in `end/data/json/`)
- Google Cloud service account JSON files
- Used for OAuth2 token generation
- Format: Standard Google service account key format

### Token Storage (in `end/data/jwt/`)
- Cached OAuth2 tokens with expiration tracking
- Automatically refreshed before expiration

## Environment Configuration

Key environment variables (see `.env` file):
- `GEMINI_API_KEYS`: Comma-separated list of API keys for rotation
- `KEY_ROTATION_STRATEGY`: Key selection strategy (`round_robin`, `weighted`, etc.)
- `RATE_LIMIT_REQUESTS_PER_MINUTE`: Request rate limiting
- `LOG_REQUEST_BODY`/`LOG_RESPONSE_BODY`: Logging control
- `REDIS_HOST`/`REDIS_PORT`: Redis connection settings

## Lua Module Architecture

### Core Modules
- **`config.lua`**: Environment-based configuration management
- **`key_manager.lua`**: OAuth2 token lifecycle management
- **`key_validator.lua`**: Client authentication and authorization
- **`rate_limiter.lua`**: Request rate limiting with Redis backend
- **`response_handler.lua`**: Response processing and error handling
- **`logger.lua`**: Structured logging with configurable levels

### Request Processing Flow
1. `access_by_lua_block`: Authentication, rate limiting, key selection
2. `proxy_pass`: Forward to Google API with modified headers
3. `body_filter_by_lua_block`: Process streaming/non-streaming responses
4. `log_by_lua_block`: Log request details and update key health

## Streaming Support

### Request Types
- **Streaming**: URLs containing "stream" (e.g., `:streamGenerateContent`)
- **Non-streaming**: Standard request/response pattern
- **Auto-detection**: Based on URL patterns and headers

### Configuration
- `proxy_buffering off`: Real-time data forwarding
- `proxy_request_buffering off`: Handle large request bodies
- Extended timeouts for long-running streams

## Security Considerations

### Privacy Protection
- No client IP forwarding to upstream APIs
- Removal of identifying headers (X-Forwarded-For, User-Agent, etc.)
- Configurable logging to avoid sensitive data exposure

### Authentication Security
- Service account credentials stored securely in JSON files
- OAuth2 tokens cached with automatic refresh
- Client authorization through mapping files

## Testing Strategy

### Module Testing
Each Lua module supports independent testing:
- Test service account credential reading
- Test JWT assertion creation
- Test OAuth2 token acquisition
- Test client validation and mapping
- Test model name extraction

### Integration Testing
- Complete request processing flow
- Streaming and non-streaming request handling
- Error handling and recovery
- Performance under high concurrency

## Important Notes

1. **Configuration Location**: All runtime configuration is in `end/data/` directory
2. **Requirements Document**: Read `end/doc.txt` for complete specifications
3. **Current State**: Project appears to be in active development with basic infrastructure set up
4. **Privacy First**: Strong emphasis on protecting client information from upstream APIs
5. **Modular Design**: Clean separation of concerns allows independent testing and development

## Common Issues

- **Port Conflicts**: Default ports are 8888 (HTTP) and 8443 (HTTPS)
- **Redis Dependency**: Ensure Redis is running before starting proxy
- **SSL Certificates**: Check SSL configuration for HTTPS endpoints
- **Log Permissions**: Ensure log directory is writable by container

## Future Development

The project is designed for enterprise-level requirements with planned features including:
- Redis-based configuration storage
- Multi-instance deployment support
- Management API for dynamic configuration
- Advanced rate limiting and monitoring