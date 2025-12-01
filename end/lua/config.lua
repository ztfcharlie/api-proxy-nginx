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
    app_config = "/usr/local/openresty/nginx/config/app_config.json",
    map_config = "/usr/local/openresty/nginx/data/map/map-config.json",
    json_dir = "/usr/local/openresty/nginx/data/json/",
    jwt_dir = "/usr/local/openresty/nginx/data/jwt/"
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

-- 解析服务类型前缀（gemini-, claude- 等）
local function parse_service_type(client_token)
    if not client_token then
        return nil
    end

    -- 提取前缀（如 "gemini-", "claude-"）
    local prefix = client_token:match("^([^%-]+)%-")
    return prefix
end

-- 加载统一配置文件
local function load_map_config()
    local map_config, err = read_json_file(paths.map_config)
    if not map_config then
        ngx.log(ngx.ERR, "Cannot load map config: ", err)
        return nil
    end

    -- 验证配置结构
    if not map_config.clients or type(map_config.clients) ~= "table" then
        ngx.log(ngx.ERR, "Invalid map config: missing or invalid 'clients' field")
        return nil
    end

    -- 构建索引以便快速查找
    local client_index = {}
    for _, client in ipairs(map_config.clients) do
        if client.client_token then
            client_index[client.client_token] = client
        end
    end

    -- 构建服务账号文件到模型映射的索引
    local key_models_index = {}

    -- 处理 gemini 服务账号
    if map_config.key_filename_gemini then
        for _, key_config in ipairs(map_config.key_filename_gemini) do
            if key_config.key_filename and key_config.models then
                key_models_index[key_config.key_filename] = key_config.models
            end
        end
    end

    -- 处理 claude 服务账号
    if map_config.key_filename_claude then
        for _, key_config in ipairs(map_config.key_filename_claude) do
            if key_config.key_filename and key_config.models then
                key_models_index[key_config.key_filename] = key_config.models
            end
        end
    end

    return {
        raw_config = map_config,
        client_index = client_index,
        key_models_index = key_models_index
    }
end

-- 初始化配置
function _M.init()
    -- 加载应用配置
    config_cache.app = load_app_config()

    -- 加载统一映射配置
    local map_config = load_map_config()
    if map_config then
        config_cache.map_config = map_config
        config_loaded = true
        ngx.log(ngx.INFO, "Configuration loaded successfully")
    else
        ngx.log(ngx.ERR, "Failed to load map configuration")
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

-- 获取路径配置
function _M.get_paths()
    return config_cache.paths or paths
end

-- 检查配置是否已加载
function _M.is_loaded()
    return config_loaded
end

-- 根据 client_token 获取客户端配置
function _M.get_client_config(client_token)
    local map_config = config_cache.map_config
    if not map_config or not map_config.client_index then
        return nil
    end
    return map_config.client_index[client_token]
end

-- 获取客户端状态
function _M.get_client_status(client_token)
    local client_config = _M.get_client_config(client_token)
    if not client_config then
        return nil
    end
    return client_config.enable and "enable" or "disable"
end

-- 根据 client_token 和服务类型获取可用的服务账号文件列表
function _M.get_client_key_files(client_token)
    local client_config = _M.get_client_config(client_token)
    if not client_config then
        return nil, "Client not found"
    end

    -- 解析服务类型
    local service_type = parse_service_type(client_token)
    if not service_type then
        return nil, "Cannot parse service type from client_token"
    end

    -- 根据服务类型选择对应的 key_filename 字段
    local key_field = "key_filename_" .. service_type
    local key_files = client_config[key_field]

    if not key_files or type(key_files) ~= "table" or #key_files == 0 then
        return nil, "No key files configured for service type: " .. service_type
    end

    return key_files, nil
end

-- 获取模型对应的 API 域名
function _M.get_model_domain(key_filename, model_name)
    local map_config = config_cache.map_config
    if not map_config or not map_config.key_models_index then
        return nil
    end

    local models = map_config.key_models_index[key_filename]
    if not models then
        return nil
    end

    -- 遍历模型列表查找匹配的模型
    for _, model_config in ipairs(models) do
        if model_config.model == model_name then
            return model_config.domain
        end
    end

    return nil
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