# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **OpenResty-based API Proxy Gateway** that acts as a transparent proxy for Google's Gemini API. The system intercepts client requests, replaces client API keys with server-side Google API keys, and forwards requests to Google's generative language APIs.

## Architecture

### Core Components
- **OpenResty (Nginx + Lua)**: Main proxy server with Lua scripting capabilities
- **Docker Compose**: Container orchestration for deployment
- **Redis**: Caching layer for rate limiting and key management (when implemented)
- **Lua Modules**: Business logic for key replacement, logging, and request handling

### Key Design Patterns
- **Transparent Proxy**: Maintains API compatibility with Google's Gemini API
- **Key Replacement**: Secure server-side API key substitution
- **Request Logging**: Privacy-focused logging (no request/response bodies)
- **Streaming Support**: Handles both HTTP streaming and non-streaming requests

## Development Commands

Based on the project requirements in `doc.txt`, the following commands would be used:

### Docker Operations
```bash
# Build and start the proxy service
docker-compose up -d

# View logs
docker-compose logs -f api-proxy-nginx

# Stop services
docker-compose down

# Rebuild after changes
docker-compose up -d --build
```

### Development Workflow
```bash
# Test the proxy endpoint (replace with actual domain)
curl "http://localhost:8888/v1beta/models/gemini-embedding-001:embedContent" \
  -H "x-goog-api-key: $Client_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model": "models/gemini-embedding-001", "content": {"parts":[{"text": "What is the meaning of life?"}]}}'

# Check service health
curl http://localhost:8888/health

# Monitor request logs
tail -f logs/requests.log
```

## File Structure

When fully implemented, the project should have this structure:

```
├── docker-compose.yaml          # Container orchestration
├── nginx.conf                   # Main Nginx configuration
├── conf.d/
│   ├── gemini-proxy.conf       # Proxy configuration
│   └── default.conf            # Default server config
├── lua/
│   ├── config.lua              # Main configuration (host-mounted)
│   ├── key_manager.lua         # API key replacement logic
│   ├── logger.lua              # Request logging
│   └── rate_limiter.lua        # Rate limiting (optional)
├── logs/                       # Log files directory
└── doc.txt                     # Project requirements
```

## Configuration

### Environment Variables
- `GEMINI_API_KEY`: Google API key for server-side requests
- `CLIENT_API_KEY`: Client API key to be replaced (for testing)

### Key Configuration File: `lua/config.lua`
This file should contain:
- Google API endpoint configuration
- API key mapping
- Logging settings
- Rate limiting parameters (if implemented)

## API Transformation

The proxy performs the following transformation:

**Input Request:**
```
POST http://mydomain.com/v1beta/models/gemini-embedding-001:embedContent
x-goog-api-key: $Client_API_KEY
```

**Forwarded Request:**
```
POST http://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent
x-goog-api-key: $GEMINI_API_KEY
```

## Logging Requirements

The system logs the following information:
- Request ID (generated)
- Timestamp
- Request URL
- Google API response status code
- **No request/response bodies** (privacy requirement)

## Development Notes

### Lua Module Development
- Use OpenResty's `resty.*` libraries for HTTP operations
- Implement proper error handling for upstream failures
- Ensure streaming requests are handled correctly
- Maintain request/response headers except for API key replacement

### Docker Configuration
- Base image: `openresty/openresty:alpine`
- Container name: `api-proxy-nginx`
- Network: `api-proxy` bridge network
- Mount `lua/config.lua` from host for easy configuration updates

### Testing Considerations
- Test both streaming and non-streaming requests
- Verify API key replacement functionality
- Test error handling for invalid keys
- Validate logging output format
- Test with various Gemini API endpoints (embedContent, generateContent, etc.)

## Security Notes
- API keys are replaced server-side to prevent client key exposure
- No sensitive data should be logged in request/response bodies
- Ensure proper input validation for forwarded requests