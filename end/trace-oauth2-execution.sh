#!/bin/bash

# OAuth2执行路径跟踪脚本

echo "=== OAuth2 Execution Path Trace ==="

echo "当你发送这个请求时:"
echo "curl -X POST http://localhost:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \\"
echo "  -H \"Authorization: Bearer gemini-client-key-aaaa\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"contents\":[{\"parts\":[{\"text\":\"Hello\"}]}]}'"

echo ""
echo "=== 执行路径跟踪 ==="

echo ""
echo "1. nginx接收请求 (端口8888 -> 容器内8080)"
echo "   文件: /usr/local/openresty/nginx/conf/conf.d/gemini-proxy.conf"
echo "   匹配: location ~ ^/v1/projects/([^/]+)/locations/([^/]+)/publishers/google/models/([^/:]+):(.+)$"

echo ""
echo "2. 执行 access_by_lua_block"
echo "   调用: auth_manager.authenticate_client()"
echo "   文件: /usr/local/openresty/lua/auth_manager_oauth2.lua"

echo ""
echo "3. 客户端认证流程:"
echo "   3.1 utils.extract_client_token() -> 'gemini-client-key-aaaa'"
echo "   3.2 config.get_client_status() -> 检查 data/map/map-config.json"
echo "   3.3 select_available_key_file() -> 'carbide-team-service-account.json'"

echo ""
echo "4. OAuth2 Token获取流程:"
echo "   4.1 检查内存缓存: ngx.shared.token_cache:get('token:carbide-team-service-account.json')"
echo "   4.2 检查文件缓存: data/jwt/carbide-team-service-account.json"
echo "   4.3 如果缓存未命中，执行OAuth2流程:"

echo ""
echo "5. JWT创建流程 (oauth2_client.lua):"
echo "   5.1 读取服务账号: data/json/carbide-team-service-account.json"
echo "   5.2 创建JWT Header: {\"alg\":\"RS256\",\"typ\":\"JWT\"}"
echo "   5.3 创建JWT Payload: {"
echo "       \"iss\": \"service@carbide-team-478005-f8.iam.gserviceaccount.com\","
echo "       \"scope\": \"https://www.googleapis.com/auth/cloud-platform\","
echo "       \"aud\": \"https://oauth2.googleapis.com/token\","
echo "       \"exp\": $(date -d '+1 hour' +%s),"
echo "       \"iat\": $(date +%s)"
echo "   }"
echo "   5.4 使用OpenSSL签名: openssl dgst -sha256 -sign private_key"

echo ""
echo "6. OAuth2请求流程:"
echo "   6.1 方式A: nginx subrequest到 /internal/oauth2"
echo "   6.2 方式B: curl命令到 https://oauth2.googleapis.com/token"
echo "   6.3 POST数据: grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=JWT"

echo ""
echo "7. Token缓存:"
echo "   7.1 内存缓存: ngx.shared.token_cache:set(key, token_json, expires_in)"
echo "   7.2 文件缓存: 写入 data/jwt/carbide-team-service-account.json"

echo ""
echo "8. 请求头替换:"
echo "   8.1 移除: Authorization: Bearer gemini-client-key-aaaa"
echo "   8.2 设置: Authorization: Bearer ya29.c.c0ASRK0Gb... (Google access_token)"
echo "   8.3 设置: Host: generativelanguage.googleapis.com"

echo ""
echo "9. API转发:"
echo "   9.1 proxy_pass https://generativelanguage.googleapis.com"
echo "   9.2 完整URL: https://generativelanguage.googleapis.com/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent"

echo ""
echo "10. 响应处理:"
echo "    10.1 header_filter_by_lua_block: 清理响应头"
echo "    10.2 body_filter_by_lua_block: 处理响应体（如果是流式）"
echo "    10.3 log_by_lua_block: 记录请求日志"

echo ""
echo "=== 配置文件依赖 ==="
echo ""
echo "必需的配置文件:"
echo "1. data/map/map-config.json - 客户端到服务账号映射"
echo "2. data/json/carbide-team-service-account.json - Google服务账号凭证"
echo "3. config/app_config.json - 应用配置（可选，有默认值）"

echo ""
echo "生成的缓存文件:"
echo "1. data/jwt/carbide-team-service-account.json - OAuth2 token缓存"
echo "2. ngx.shared.token_cache - 内存中的token缓存"

echo ""
echo "=== 实际测试 ==="
echo ""
echo "要测试这个流程，你需要:"
echo "1. 有效的Google Cloud服务账号JSON文件"
echo "2. 正确的项目ID和权限配置"
echo "3. 在map-config.json中配置客户端映射"

echo ""
echo "测试命令:"
echo "curl -v -X POST http://localhost:8888/v1/projects/carbide-team-478005-f8/locations/global/publishers/google/models/gemini-2.5-pro:generateContent \\"
echo "  -H \"Authorization: Bearer gemini-client-key-aaaa\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"contents\":[{\"parts\":[{\"text\":\"Hello from OAuth2 proxy!\"}]}]}'"

echo ""
echo "查看OAuth2日志:"
echo "docker logs api-proxy-nginx | grep -E '\\[OAuth2\\]|\\[TEST\\]'"