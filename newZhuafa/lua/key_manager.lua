-- API Key Manager module
local config = require "config"
local oauth_manager = require "oauth_manager"

local _M = {}

-- Replace client API key with OAuth2 access token
function _M.replace_api_key(client_key)
    -- Check if client key is provided (for validation purposes)
    if not client_key or client_key == "" then
        ngx.log(ngx.WARN, "No API key provided in request")
        return nil
    end

    -- Log the key replacement (without exposing the actual keys)
    ngx.log(ngx.INFO, "Replacing client API key with OAuth2 access token")

    -- Validate client key if needed
    if config.api_keys.validate_client_keys then
        if not config.api_keys.client_keys[client_key] then
            ngx.log(ngx.WARN, "Invalid client API key provided")
            return nil
        end
    end

    -- Get OAuth2 access token
    local access_token = oauth_manager.get_access_token()
    if not access_token then
        ngx.log(ngx.ERR, "Failed to obtain OAuth2 access token")
        return nil
    end

    return access_token
end

-- Set authentication headers for Google API
function _M.set_auth_headers(access_token)
    -- Remove the x-goog-api-key header if it exists
    ngx.req.set_header("x-goog-api-key", nil)

    -- Set Authorization header with Bearer token
    ngx.req.set_header("Authorization", "Bearer " .. access_token)

    ngx.log(ngx.INFO, "Set OAuth2 Authorization header")
end

-- Process authentication using OAuth2
function _M.process_oauth_authentication(client_key)
    -- Get OAuth2 access token
    local access_token = _M.replace_api_key(client_key)
    if not access_token then
        return false, "Failed to obtain access token"
    end

    -- Set authentication headers
    _M.set_auth_headers(access_token)

    return true, "OAuth2 authentication successful"
end

-- Validate API key format (optional)
function _M.validate_key_format(api_key)
    if not api_key then
        return false
    end

    -- Basic validation - check if it's not empty and has reasonable length
    if string.len(api_key) < 10 then
        return false
    end

    -- Add more validation rules if needed
    return true
end

-- Get Google API key
function _M.get_google_key()
    return config.api_keys.google_key
end

-- Check if Google API key is configured
function _M.is_google_key_configured()
    local key = config.api_keys.google_key
    return key and key ~= "" and key ~= "your-google-api-key-here"
end

return _M