-- API Key Manager module
local config = require "config"

local _M = {}

-- Replace client API key with Google API key
function _M.replace_api_key(client_key)
    -- Check if client key is provided
    if not client_key or client_key == "" then
        ngx.log(ngx.WARN, "No API key provided in request")
        return nil
    end

    -- Log the key replacement (without exposing the actual keys)
    ngx.log(ngx.INFO, "Replacing client API key with Google API key")

    -- If you want to validate specific client keys, uncomment this:
    -- if config.api_keys.client_keys[client_key] then
    --     return config.api_keys.google_key
    -- else
    --     ngx.log(ngx.WARN, "Invalid client API key: " .. (client_key or "nil"))
    --     return nil
    -- end

    -- For now, replace any client key with the Google key
    -- This allows any client key to be used (as per requirements)
    return config.api_keys.google_key
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