local cjson = require "cjson"
local _M = {}

-- 配置缓存
local config_cache = {}
local config_loaded = false

-- 默认配置
local default_config = {
    log_level = "info",
    debug_mode = false,
    test_output = {
        enabled = false,
        request_headers = false,
        oauth_process = false,
        upstream_headers = false
    },
    token_refresh = {
        interval = 3000,
        early_refresh = 300
    },
    timeouts = {
        proxy_read = 300,
        proxy_connect = 60,
        keepalive = 65
    }
}

-- 文件路径配置
local paths = {
    app_config = "/etc/nginx/config/app_config.json",
    client_map = "/etc/nginx/data/map/map-client.json",
    client_json_map = "/etc/nginx/data/map/map-client-json.json",
    model_region_map = "/etc/nginx/data/map/map-json-model-region.json",
    json_dir = "/etc/nginx/data/json/",
    jwt_dir = "/etc/nginx/data/jwt/"
}

-- 读取 JSON 文件
local function read_json_file(file_path)
    local file = io.open(file_path, "r")
    if not file then
        return nil, "Cannot open file: " .. file_path
    end

    local content = file:read("*all")
    file:close()

    if not content or content == "" then
        return nil, "File is empty: " .. file_path
    end

    local ok, data = pcall(cjson.decode, content)
    if not ok then
        return nil, "Invalid JSON in file: " .. file_path
    end

    return data
end

-- 写入 JSON 文件
local function write_json_file(file_path, data)
    local file = io.open(file_path, "w")
    if not file then
        return false, "Cannot write to file: " .. file_path
    end

    local ok, json_str = pcall(cjson.encode, data)
    if not ok then
        file:close()
        return false, "Cannot encode JSON data"
    end

    file:write(json_str)
    file:close()
    return true
end

-- 加载应用配置
local function load_app_config()
    local app_config, err = read_json_file(paths.app_config)
    if not app_config then
        ngx.log(ngx.WARN, "Cannot load app config, using defaults: ", err)
        return default_config
    end

    -- 合并默认配置和用户配置
    local merged_config = {}
    for k, v in pairs(default_config) do
        if type(v) == "table" then
            merged_config[k] = {}
            for k2, v2 in pairs(v) do
                merged_config[k][k2] = (app_config[k] and app_config[k][k2]) or v2
            end
        else
            merged_config[k] = app_config[k] or v
        end
    end

    return merged_config
end

-- 加载客户端映射
local function load_client_maps()
    local client_map, err1 = read_json_file(paths.client_map)
    if not client_map then
        ngx.log(ngx.ERR, "Cannot load client map: ", err1)
        return nil
    end

    local client_json_map, err2 = read_json_file(paths.client_json_map)
    if not client_json_map then
        ngx.log(ngx.ERR, "Cannot load client-json map: ", err2)
        return nil
    end

    local model_region_map, err3 = read_json_file(paths.model_region_map)
    if not model_region_map then
        ngx.log(ngx.ERR, "Cannot load model-region map: ", err3)
        return nil
    end

    return {
        client_map = client_map,
        client_json_map = client_json_map,
        model_region_map = model_region_map
    }
end

-- 初始化配置
function _M.init()
    -- 加载应用配置
    config_cache.app = load_app_config()

    -- 加载映射配置
    local maps = load_client_maps()
    if maps then
        config_cache.maps = maps
        config_loaded = true
        ngx.log(ngx.INFO, "Configuration loaded successfully")
    else
        ngx.log(ngx.ERR, "Failed to load configuration maps")
        config_loaded = false
    end

    -- 设置路径
    config_cache.paths = paths
end

-- 重新加载配置
function _M.reload()
    config_cache = {}
    config_loaded = false
    _M.init()
    return config_loaded
end

-- 获取应用配置
function _M.get_app_config()
    return config_cache.app or default_config
end

-- 获取映射配置
function _M.get_maps()
    return config_cache.maps
end

-- 获取路径配置
function _M.get_paths()
    return config_cache.paths or paths
end

-- 检查配置是否已加载
function _M.is_loaded()
    return config_loaded
end

-- 获取客户端状态
function _M.get_client_status(client_id)
    local maps = config_cache.maps
    if not maps or not maps.client_map then
        return nil
    end
    return maps.client_map[client_id]
end

-- 获取客户端对应的 JSON 文件
function _M.get_client_json_file(client_id)
    local maps = config_cache.maps
    if not maps or not maps.client_json_map then
        return nil
    end
    return maps.client_json_map[client_id]
end

-- 获取模型对应的 API 主机
function _M.get_model_api_host(json_file, model_name)
    local maps = config_cache.maps
    if not maps or not maps.model_region_map then
        return nil
    end

    local json_config = maps.model_region_map[json_file]
    if not json_config then
        return nil
    end

    return json_config[model_name]
end

-- 读取服务账号凭证
function _M.read_service_account(json_file)
    local file_path = paths.json_dir .. json_file
    return read_json_file(file_path)
end

-- 读取缓存的 JWT Token
function _M.read_cached_token(json_file)
    local file_path = paths.jwt_dir .. json_file
    return read_json_file(file_path)
end

-- 写入缓存的 JWT Token
function _M.write_cached_token(json_file, token_data)
    local file_path = paths.jwt_dir .. json_file
    return write_json_file(file_path, token_data)
end

-- 日志辅助函数
function _M.should_log(level)
    local app_config = _M.get_app_config()
    local log_levels = { debug = 1, info = 2, warn = 3, error = 4 }
    local current_level = log_levels[app_config.log_level] or 2
    local check_level = log_levels[level] or 2
    return check_level >= current_level
end

-- 测试输出辅助函数
function _M.should_test_output(category)
    local app_config = _M.get_app_config()
    if not app_config.test_output.enabled then
        return false
    end
    return app_config.test_output[category] or false
end

return _M