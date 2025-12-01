#!/usr/bin/env lua

-- 单元测试：utils.lua 模块
-- 测试工具函数

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
    time = function() return os.time() end,
    encode_base64 = function(data)
        -- 简单的 base64 编码模拟
        return "base64_encoded_" .. data
    end,
    decode_base64 = function(data)
        return data:gsub("base64_encoded_", "")
    end,
    var = {
        pid = "12345",
        request_id = "test-request-id",
        client_token = "gemini-client-key-aaaa",
        key_filename = "hulaoban-202504.json",
        model_name = "gemini-3-pro-preview",
        api_host = "aiplatform.googleapis.com",
        request_method = "POST",
        request_uri = "/v1/test",
        request_time = "0.123",
        upstream_status = "200",
        upstream_response_time = "0.100"
    },
    status = 200
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

local function assert_true(value, message)
    if not value then
        error(string.format("FAIL: %s", message or "Assertion failed"))
    end
    print(string.format("✓ PASS: %s", message or "Test passed"))
end

print("========================================")
print("测试 utils.lua 模块")
print("========================================")
print()

-- 加载模块（需要先加载 config）
local config_module_code = io.open("../lua/config.lua", "r"):read("*all")
config_module_code = config_module_code:gsub(
    'app_config = "/etc/nginx/config/app_config.json"',
    'app_config = "../config/app_config.json"'
)
config_module_code = config_module_code:gsub(
    'map_config = "/etc/nginx/data/map/map%-config.json"',
    'map_config = "../data/map/map-config.json"'
)
local config = assert(load(config_module_code))()
config.init()

local utils = require "utils"

print("1. 测试生成请求ID")
print("-------------------------------------------")
local request_id1 = utils.generate_request_id()
assert_not_nil(request_id1, "应该生成请求ID")
print("请求ID:", request_id1)

local request_id2 = utils.generate_request_id()
assert_not_nil(request_id2, "应该生成第二个请求ID")
print("请求ID:", request_id2)
print()

print("2. 测试提取模型名称")
print("-------------------------------------------")
local uri1 = "/v1/projects/test-project/locations/global/publishers/google/models/gemini-3-pro-preview:generateContent"
local model1 = utils.extract_model_name(uri1)
assert_equal(model1, "gemini-3-pro-preview", "应该提取出 gemini-3-pro-preview")

local uri2 = "/v1/projects/test/locations/us-central1/publishers/google/models/gemini-embedding-001:predict"
local model2 = utils.extract_model_name(uri2)
assert_equal(model2, "gemini-embedding-001", "应该提取出 gemini-embedding-001")

local uri3 = "/invalid/url"
local model3 = utils.extract_model_name(uri3)
assert_equal(model3, nil, "无效 URL 应该返回 nil")
print()

print("3. 测试 Base64 编码/解码")
print("-------------------------------------------")
local original = "Hello World"
local encoded = utils.base64_encode(original)
assert_not_nil(encoded, "应该编码成功")
print("原始:", original)
print("编码:", encoded)

local decoded = utils.base64_decode(encoded)
assert_equal(decoded, original, "解码后应该与原始相同")
print("解码:", decoded)
print()

print("4. 测试 Base64 URL 安全编码")
print("-------------------------------------------")
local data = '{"test": "data"}'
local url_safe = utils.base64url_encode(data)
assert_not_nil(url_safe, "应该编码成功")
print("URL 安全编码:", url_safe)
-- 检查是否移除了 = 号
assert_true(not url_safe:match("="), "URL 安全编码不应该包含 =")
print()

print("5. 测试创建 JWT Header")
print("-------------------------------------------")
local jwt_header = utils.create_jwt_header()
assert_not_nil(jwt_header, "应该创建 JWT Header")
print("JWT Header:", jwt_header)
print()

print("6. 测试创建 JWT Payload")
print("-------------------------------------------")
local service_account = {
    client_email = "test@example.com"
}
local jwt_payload = utils.create_jwt_payload(service_account)
assert_not_nil(jwt_payload, "应该创建 JWT Payload")
print("JWT Payload:", jwt_payload)
print()

print("7. 测试 Token 过期检查")
print("-------------------------------------------")
local now = os.time()

-- 测试未过期的 token
local valid_token = {
    access_token = "test_token",
    expires_at = now + 3600  -- 1小时后过期
}
local is_expired1 = utils.is_token_expired(valid_token, 300)
assert_equal(is_expired1, false, "未过期的 token 应该返回 false")

-- 测试已过期的 token
local expired_token = {
    access_token = "test_token",
    expires_at = now - 100  -- 已经过期
}
local is_expired2 = utils.is_token_expired(expired_token, 300)
assert_equal(is_expired2, true, "已过期的 token 应该返回 true")

-- 测试即将过期的 token（提前5分钟刷新）
local soon_expired_token = {
    access_token = "test_token",
    expires_at = now + 200  -- 200秒后过期，但提前300秒刷新
}
local is_expired3 = utils.is_token_expired(soon_expired_token, 300)
assert_equal(is_expired3, true, "即将过期的 token 应该返回 true")

-- 测试 nil token
local is_expired4 = utils.is_token_expired(nil, 300)
assert_equal(is_expired4, true, "nil token 应该返回 true")
print()

print("8. 测试解析 Token 响应")
print("-------------------------------------------")
local response_body = cjson.encode({
    access_token = "ya29.test_access_token",
    token_type = "Bearer",
    expires_in = 3600
})
local token_data, err = utils.parse_token_response(response_body)
assert_not_nil(token_data, "应该解析成功")
assert_equal(token_data.access_token, "ya29.test_access_token", "access_token 应该匹配")
assert_equal(token_data.token_type, "Bearer", "token_type 应该匹配")
assert_equal(token_data.expires_in, 3600, "expires_in 应该匹配")
assert_not_nil(token_data.expires_at, "应该计算 expires_at")
print("Token 数据:", cjson.encode(token_data))
print()

print("9. 测试截断字符串")
print("-------------------------------------------")
local long_string = "This is a very long string that should be truncated"
local truncated = utils.truncate_string(long_string, 20)
assert_not_nil(truncated, "应该截断成功")
assert_true(#truncated < #long_string, "截断后应该更短")
print("原始:", long_string)
print("截断:", truncated)

local short_string = "Short"
local not_truncated = utils.truncate_string(short_string, 20)
assert_equal(not_truncated, short_string, "短字符串不应该被截断")
print()

print("10. 测试验证 JSON")
print("-------------------------------------------")
local valid_json = '{"key": "value"}'
local ok1, data1 = utils.validate_json(valid_json)
assert_true(ok1, "有效 JSON 应该返回 true")
assert_not_nil(data1, "应该返回解析后的数据")
print("解析结果:", cjson.encode(data1))

local invalid_json = '{invalid json}'
local ok2, data2 = utils.validate_json(invalid_json)
assert_equal(ok2, false, "无效 JSON 应该返回 false")
print()

print("11. 测试深拷贝")
print("-------------------------------------------")
local original_table = {
    a = 1,
    b = {
        c = 2,
        d = {
            e = 3
        }
    }
}
local copied_table = utils.deep_copy(original_table)
assert_not_nil(copied_table, "应该拷贝成功")
assert_equal(copied_table.a, original_table.a, "顶层值应该相同")
assert_equal(copied_table.b.c, original_table.b.c, "嵌套值应该相同")
assert_equal(copied_table.b.d.e, original_table.b.d.e, "深层嵌套值应该相同")

-- 修改拷贝不应该影响原始
copied_table.b.c = 999
assert_equal(original_table.b.c, 2, "修改拷贝不应该影响原始")
print()

print("12. 测试检查空表")
print("-------------------------------------------")
local empty_table = {}
assert_true(utils.is_empty_table(empty_table), "空表应该返回 true")

local non_empty_table = {a = 1}
assert_equal(utils.is_empty_table(non_empty_table), false, "非空表应该返回 false")
print()

print("13. 测试安全字符串连接")
print("-------------------------------------------")
local result1 = utils.safe_concat("Hello", " ", "World")
assert_equal(result1, "Hello World", "应该正确连接字符串")

local result2 = utils.safe_concat("Test", nil, "Value", nil)
assert_equal(result2, "TestValue", "应该跳过 nil 值")

local result3 = utils.safe_concat(123, " ", 456)
assert_equal(result3, "123 456", "应该转换数字为字符串")
print()

print("========================================")
print("✓ 所有测试通过！")
print("========================================")
