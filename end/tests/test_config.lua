#!/usr/bin/env lua

-- 单元测试：config.lua 模块
-- 测试配置加载和各种查询函数

package.path = package.path .. ";../lua/?.lua"

local cjson = require "cjson"

-- 模拟 ngx 对象
_G.ngx = {
    log = function(level, ...)
        local args = {...}
        local msg = table.concat(args, " ")
        print(string.format("[LOG] %s", msg))
    end,
    INFO = 1,
    WARN = 2,
    ERR = 3,
    time = function() return os.time() end
}

-- 测试辅助函数
local function assert_equal(actual, expected, message)
    if actual ~= expected then
        error(string.format("FAIL: %s\nExpected: %s\nActual: %s",
            message or "Assertion failed",
            tostring(expected),
            tostring(actual)))
    end
    print(string.format("✓ PASS: %s", message or "Test passed"))
end

local function assert_not_nil(value, message)
    if value == nil then
        error(string.format("FAIL: %s - value is nil", message or "Assertion failed"))
    end
    print(string.format("✓ PASS: %s", message or "Test passed"))
end

local function assert_nil(value, message)
    if value ~= nil then
        error(string.format("FAIL: %s - value is not nil: %s",
            message or "Assertion failed",
            tostring(value)))
    end
    print(string.format("✓ PASS: %s", message or "Test passed"))
end

local function assert_true(value, message)
    if not value then
        error(string.format("FAIL: %s", message or "Assertion failed"))
    end
    print(string.format("✓ PASS: %s", message or "Test passed"))
end

print("========================================")
print("测试 config.lua 模块")
print("========================================")
print()

-- 修改路径配置以适应测试环境
local config_module_code = io.open("../lua/config.lua", "r"):read("*all")

-- 替换路径为测试路径
config_module_code = config_module_code:gsub(
    'app_config = "/etc/nginx/config/app_config.json"',
    'app_config = "../config/app_config.json"'
)
config_module_code = config_module_code:gsub(
    'map_config = "/etc/nginx/data/map/map%-config.json"',
    'map_config = "../data/map/map-config.json"'
)
config_module_code = config_module_code:gsub(
    'json_dir = "/etc/nginx/data/json/"',
    'json_dir = "../data/json/"'
)
config_module_code = config_module_code:gsub(
    'jwt_dir = "/etc/nginx/data/jwt/"',
    'jwt_dir = "../data/jwt/"'
)

-- 加载修改后的模块
local config = assert(load(config_module_code))()

print("1. 测试配置初始化")
print("-------------------------------------------")
config.init()
assert_true(config.is_loaded(), "配置应该成功加载")
print()

print("2. 测试获取客户端配置")
print("-------------------------------------------")
local client_config = config.get_client_config("gemini-client-key-aaaa")
assert_not_nil(client_config, "应该找到 gemini-client-key-aaaa 配置")
assert_equal(client_config.enable, true, "gemini-client-key-aaaa 应该是启用状态")
print("客户端配置:", cjson.encode(client_config))
print()

print("3. 测试获取客户端状态")
print("-------------------------------------------")
local status1 = config.get_client_status("gemini-client-key-aaaa")
assert_equal(status1, "enable", "gemini-client-key-aaaa 应该是 enable")

local status2 = config.get_client_status("gemini-client-key-bbbb")
assert_equal(status2, "disable", "gemini-client-key-bbbb 应该是 disable")

local status3 = config.get_client_status("non-existent-client")
assert_nil(status3, "不存在的客户端应该返回 nil")
print()

print("4. 测试获取客户端服务账号文件列表")
print("-------------------------------------------")
local key_files1, err1 = config.get_client_key_files("gemini-client-key-aaaa")
assert_not_nil(key_files1, "应该找到 gemini-client-key-aaaa 的服务账号列表")
assert_equal(#key_files1, 1, "gemini-client-key-aaaa 应该有 1 个服务账号")
assert_equal(key_files1[1].key_filename, "hulaoban-202504.json", "服务账号文件名应该匹配")
assert_equal(key_files1[1].key_weight, 1, "权重应该是 1")
print("服务账号列表:", cjson.encode(key_files1))
print()

print("5. 测试多服务账号客户端")
print("-------------------------------------------")
local key_files2, err2 = config.get_client_key_files("gemini-client-key-bbbb")
assert_not_nil(key_files2, "应该找到 gemini-client-key-bbbb 的服务账号列表")
assert_equal(#key_files2, 2, "gemini-client-key-bbbb 应该有 2 个服务账号")
print("服务账号列表:", cjson.encode(key_files2))
print()

print("6. 测试服务类型前缀解析")
print("-------------------------------------------")
-- 测试 gemini 前缀
local key_files_gemini, err = config.get_client_key_files("gemini-client-key-aaaa")
assert_not_nil(key_files_gemini, "gemini- 前缀应该找到 gemini 服务账号")

-- 测试不存在的前缀
local key_files_unknown, err = config.get_client_key_files("unknown-client-key-xxx")
assert_nil(key_files_unknown, "未知前缀应该返回 nil")
print("错误信息:", err)
print()

print("7. 测试获取模型域名")
print("-------------------------------------------")
local domain1 = config.get_model_domain("hulaoban-202504.json", "gemini-3-pro-preview")
assert_equal(domain1, "aiplatform.googleapis.com", "gemini-3-pro-preview 的域名应该匹配")

local domain2 = config.get_model_domain("hulaoban-202504.json", "gemini-embedding-001")
assert_equal(domain2, "us-central1-aiplatform.googleapis.com", "gemini-embedding-001 的域名应该匹配")

local domain3 = config.get_model_domain("hulaoban-202504.json", "non-existent-model")
assert_nil(domain3, "不存在的模型应该返回 nil")

local domain4 = config.get_model_domain("non-existent-file.json", "gemini-3-pro-preview")
assert_nil(domain4, "不存在的服务账号文件应该返回 nil")
print()

print("8. 测试读取服务账号凭证")
print("-------------------------------------------")
local service_account, err = config.read_service_account("hulaoban-202504.json")
if service_account then
    assert_not_nil(service_account.client_email, "服务账号应该有 client_email")
    assert_not_nil(service_account.private_key, "服务账号应该有 private_key")
    print("服务账号邮箱:", service_account.client_email)
else
    print("警告: 无法读取服务账号文件 (可能文件不存在，这在测试环境中是正常的)")
    print("错误:", err)
end
print()

print("9. 测试获取应用配置")
print("-------------------------------------------")
local app_config = config.get_app_config()
assert_not_nil(app_config, "应该返回应用配置")
assert_not_nil(app_config.log_level, "应该有 log_level 配置")
print("日志级别:", app_config.log_level)
print()

print("10. 测试路径配置")
print("-------------------------------------------")
local paths = config.get_paths()
assert_not_nil(paths, "应该返回路径配置")
assert_not_nil(paths.map_config, "应该有 map_config 路径")
assert_not_nil(paths.json_dir, "应该有 json_dir 路径")
assert_not_nil(paths.jwt_dir, "应该有 jwt_dir 路径")
print("配置文件路径:", paths.map_config)
print("JSON 目录:", paths.json_dir)
print("JWT 目录:", paths.jwt_dir)
print()

print("========================================")
print("✓ 所有测试通过！")
print("========================================")
