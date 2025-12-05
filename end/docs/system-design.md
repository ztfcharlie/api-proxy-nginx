# 大模型API中转平台系统设计文档

## 1. 系统架构概述

### 1.1 核心组件
- **OpenResty Proxy**: 高性能请求转发层
- **Node.js Management**: 密钥管理和OAuth2模拟
- **Redis**: 缓存和路由决策
- **MySQL**: 持久化存储
- **React Admin**: 管理后台

### 1.2 请求流程
```
Client → OpenResty → Lua Auth → Redis Lookup → Channel Selection → Real API
```

## 2. 数据模型设计

### 2.1 用户管理
```sql
-- 用户表
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status ENUM('active', 'suspended', 'deleted') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- 权限和配额
    quota_requests_per_day INT DEFAULT 1000,
    quota_tokens_per_day INT DEFAULT 100000,
    current_requests_today INT DEFAULT 0,
    current_tokens_today INT DEFAULT 0,
    last_quota_reset DATE DEFAULT CURDATE()
);
```

### 2.2 渠道管理
```sql
-- 渠道表（真实的API KEY）
CREATE TABLE channels (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    provider_type ENUM('vertex', 'azure', 'aws_bedrock', 'openai', 'claude') NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT, -- 某些provider需要
    project_id VARCHAR(100), -- Vertex/Azure需要
    region VARCHAR(50), -- 区域信息

    -- 支持的模型（JSON数组）
    supported_models JSON,

    -- 渠道配置
    weight DECIMAL(3,2) DEFAULT 1.0, -- 权重 0.1-1.0
    max_qps INT DEFAULT 10, -- 每秒最大请求数
    max_rpm INT DEFAULT 600, -- 每分钟最大请求数

    -- 状态和监控
    status ENUM('active', 'inactive', 'error', 'maintenance') DEFAULT 'active',
    last_health_check TIMESTAMP NULL,
    health_check_url VARCHAR(255),
    error_count INT DEFAULT 0,
    last_error_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_provider_type (provider_type),
    INDEX idx_status (status),
    INDEX idx_weight (weight)
);
```

### 2.3 API密钥管理
```sql
-- 用户API密钥表（给客户端的虚拟密钥）
CREATE TABLE user_api_keys (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    key_name VARCHAR(100) NOT NULL,
    provider_type ENUM('vertex', 'azure', 'aws_bedrock', 'openai', 'claude') NOT NULL,

    -- 生成的密钥信息
    api_key VARCHAR(255) UNIQUE NOT NULL, -- 格式: provider-specific
    key_type ENUM('oauth2', 'bearer', 'api_key') NOT NULL,
    public_key TEXT, -- RSA公钥（OAuth2类型）
    private_key_encrypted TEXT, -- 加密的私钥

    -- 权限配置
    channel_ids JSON, -- 可使用的渠道ID数组
    allowed_models JSON, -- 允许的模型列表
    forbidden_models JSON, -- 禁用的模型列表

    -- 限制和配额
    max_requests_per_hour INT DEFAULT 100,
    max_tokens_per_hour INT DEFAULT 10000,

    -- 状态
    status ENUM('active', 'suspended', 'expired') DEFAULT 'active',
    expires_at TIMESTAMP NULL,
    last_used_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_id (user_id),
    INDEX idx_api_key (api_key),
    INDEX idx_provider_type (provider_type),
    INDEX idx_status (status)
);
```

### 2.4 渠道权重配置
```sql
-- API密钥对应的渠道权重配置
CREATE TABLE api_key_channel_weights (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    api_key_id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL,
    weight DECIMAL(3,2) NOT NULL DEFAULT 1.0, -- 0.1-1.0
    priority INT DEFAULT 1, -- 优先级 1-10

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (api_key_id, channel_id),
    FOREIGN KEY (api_key_id) REFERENCES user_api_keys(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id),

    INDEX idx_weight (weight),
    INDEX idx_priority (priority)
);
```

## 3. Redis数据结构设计

### 3.1 缓存键命名规范
```
api:keys:{api_key}                    # API密钥信息缓存
api:channels:{provider_type}           # 某类型的活跃渠道列表
api:routing:{api_key}:{model}          # 路由决策缓存
api:quota:{user_id}:{date}             # 用户配额使用情况
api:channel:stats:{channel_id}         # 渠道统计信息
api:channel:health:{channel_id}        # 渠道健康状态
oauth2:tokens:{virtual_token}          # OAuth2虚拟token映射
```

### 3.2 Redis数据结构示例

```lua
-- API密钥信息 (Hash)
HSET api:keys:vertex-ak-123456
    user_id "1001"
    provider_type "vertex"
    channel_ids "[1,2,3]"
    allowed_models '["gemini-pro","gemini-pro-vision"]'
    weight_config '{"1":0.5,"2":0.3,"3":0.2}'
    expires_at "1704067200"

-- 渠道列表 (Sorted Set by weight)
ZADD api:channels:vertex 0.5 "channel:1"
ZADD api:channels:vertex 0.3 "channel:2"
ZADD api:channels:vertex 0.2 "channel:3"

-- 路由决策缓存 (String, TTL: 60s)
SET api:routing:vertex-ak-123456:gemini-pro "channel:1" EX 60

-- OAuth2 Token映射 (Hash, TTL: 3600s)
HSET oauth2:tokens:ya29.virtual.abc123
    api_key "vertex-ak-123456"
    channel_id "1"
    real_token "ya29.real.xyz789"
    expires_at "1704067200"
```

## 4. Lua模块优化设计

### 4.1 密钥验证模块 (access_check_v3.lua)

```lua
local _M = {}
local redis = require "resty.redis"
local cjson = require "cjson"
local string_find = string.find
local string_sub = string.sub

-- Redis连接池
local redis_pool = {
    host = "api-proxy-redis",
    port = 6379,
    password = "123456",
    timeout = 1000,
    max_idle_timeout = 10000,
    pool_size = 100
}

-- 获取Redis连接
local function get_redis()
    local red = redis:new()
    red:set_timeout(redis_pool.timeout)

    local ok, err = red:connect(redis_pool.host, redis_pool.port)
    if not ok then
        ngx.log(ngx.ERR, "Redis connect failed: ", err)
        return nil, err
    end

    if redis_pool.password then
        ok, err = red:auth(redis_pool.password)
        if not ok then
            ngx.log(ngx.ERR, "Redis auth failed: ", err)
            return nil, err
        end
    end

    return red
}

-- 释放Redis连接
local function close_redis(red)
    if not red then
        return
    end

    local ok, err = red:set_keepalive(redis_pool.max_idle_timeout, redis_pool.pool_size)
    if not ok then
        ngx.log(ngx.ERR, "Redis set keepalive failed: ", err)
    end
end

-- 提取API密钥
local function extract_api_key()
    local auth_header = ngx.var.http_authorization
    if not auth_header then
        return nil, "Missing Authorization header"
    end

    -- Bearer token
    if string_find(auth_header, "Bearer ", 1, true) then
        return string_sub(auth_header, 8)
    end

    -- OAuth2 token (格式: ya29.*)
    if string_find(auth_header, "ya29.", 1, true) then
        return auth_header
    end

    return nil, "Invalid authorization format"
end

-- 从缓存获取API密钥信息
local function get_api_key_from_cache(api_key)
    local red, err = get_redis()
    if not red then
        return nil, err
    end

    local cache_key = "api:keys:" .. api_key
    local data, err = red:hgetall(cache_key)

    close_redis(red)

    if err then
        ngx.log(ngx.ERR, "Redis get failed: ", err)
        return nil, err
    end

    if #data == 0 then
        return nil, "API key not found"
    end

    -- 转换为table
    local result = {}
    for i = 1, #data, 2 do
        result[data[i]] = data[i+1]
    end

    -- 检查过期时间
    if result.expires_at and tonumber(result.expires_at) < ngx.time() then
        return nil, "API key expired"
    end

    -- 更新最后使用时间
    red, err = get_redis()
    if red then
        red:hset(cache_key, "last_used_at", ngx.time())
        close_redis(red)
    end

    return result
end

-- 获取可用渠道
local function get_available_channels(api_key_info, model)
    local red, err = get_redis()
    if not red then
        return nil, err
    end

    local provider_type = api_key_info.provider_type
    local channel_ids = cjson.decode(api_key_info.channel_ids)

    -- 获取该provider的所有活跃渠道
    local channels_key = "api:channels:" .. provider_type
    local channels, err = red:zrevrange(channels_key, 0, -1, "WITHSCORES")

    close_redis(red)

    if err then
        ngx.log(ngx.ERR, "Redis zrevrange failed: ", err)
        return nil, err
    end

    -- 过滤出该API密钥可使用的渠道
    local available_channels = {}
    local weight_config = cjson.decode(api_key_info.weight_config)
    local allowed_models = cjson.decode(api_key_info.allowed_models)

    -- 检查模型是否被允许
    local model_allowed = false
    for _, allowed_model in ipairs(allowed_models) do
        if model == allowed_model or string_find(model, allowed_model, 1, true) then
            model_allowed = true
            break
        end
    end

    if not model_allowed then
        return nil, "Model not allowed for this API key"
    end

    for i = 1, #channels, 2 do
        local channel_info = channels[i]
        local weight = tonumber(channels[i+1])
        local channel_id = string.match(channel_info, "channel:(%d+)")

        -- 检查是否在允许的渠道列表中
        for _, cid in ipairs(channel_ids) do
            if tostring(cid) == channel_id and weight > 0 then
                -- 使用权重配置中的权重
                local final_weight = weight_config[channel_id] or weight
                table.insert(available_channels, {
                    id = tonumber(channel_id),
                    weight = final_weight,
                    info = channel_info
                })
                break
            end
        end
    end

    if #available_channels == 0 then
        return nil, "No available channels for this API key"
    end

    return available_channels
end

-- 加权随机选择渠道
local function select_channel(channels)
    local total_weight = 0
    for _, channel in ipairs(channels) do
        total_weight = total_weight + channel.weight
    end

    if total_weight == 0 then
        return channels[1] -- 如果权重都为0，返回第一个
    end

    local random = math.random() * total_weight
    local current_weight = 0

    for _, channel in ipairs(channels) do
        current_weight = current_weight + channel.weight
        if random <= current_weight then
            return channel
        end
    end

    return channels[#channels] -- 返回最后一个作为后备
end

-- 获取渠道的真实认证信息
local function get_channel_auth(channel_id, provider_type)
    local red, err = get_redis()
    if not red then
        return nil, err
    end

    -- 从渠道缓存获取认证信息
    local auth_key = "api:channel:auth:" .. channel_id
    local auth_data, err = red:hgetall(auth_key)

    close_redis(red)

    if err then
        ngx.log(ngx.ERR, "Redis get channel auth failed: ", err)
        return nil, err
    end

    if #auth_data == 0 then
        return nil, "Channel auth not found in cache"
    end

    local result = {}
    for i = 1, #auth_data, 2 do
        result[auth_data[i]] = auth_data[i+1]
    end

    return result
end

-- 主验证函数
function _M.check_access()
    -- 提取API密钥
    local api_key, err = extract_api_key()
    if not api_key then
        ngx.status = 401
        ngx.say('{"error": "' .. err .. '"}')
        return ngx.exit(401)
    end

    -- 从缓存获取API密钥信息
    local api_key_info, err = get_api_key_from_cache(api_key)
    if not api_key_info then
        ngx.status = 401
        ngx.say('{"error": "' .. err .. '"}')
        return ngx.exit(401)
    end

    -- 获取请求的模型
    local model = ngx.var.model_name or "unknown"

    -- 获取路由决策缓存
    local cache_key = "api:routing:" .. api_key .. ":" .. model
    local red, _ = get_redis()
    if red then
        local cached_channel, err = red:get(cache_key)
        if cached_channel and cached_channel ~= ngx.null then
            -- 使用缓存的渠道
            local channel_auth, err = get_channel_auth(cached_channel, api_key_info.provider_type)
            close_redis(red)

            if channel_auth then
                ngx.ctx.channel_id = cached_channel
                ngx.ctx.api_key_info = api_key_info
                ngx.ctx.channel_auth = channel_auth
                return
            end
        end
        close_redis(red)
    end

    -- 获取可用渠道
    local channels, err = get_available_channels(api_key_info, model)
    if not channels then
        ngx.status = 403
        ngx.say('{"error": "' .. err .. '"}')
        return ngx.exit(403)
    end

    -- 选择渠道
    local selected_channel = select_channel(channels)

    -- 缓存路由决策（60秒）
    red, _ = get_redis()
    if red then
        red:setex(cache_key, 60, selected_channel.id)
        close_redis(red)
    end

    -- 获取渠道认证信息
    local channel_auth, err = get_channel_auth(selected_channel.id, api_key_info.provider_type)
    if not channel_auth then
        ngx.status = 500
        ngx.say('{"error": "Failed to get channel auth: ' .. err .. '"}')
        return ngx.exit(500)
    end

    -- 设置上下文变量
    ngx.ctx.channel_id = selected_channel.id
    ngx.ctx.api_key_info = api_key_info
    ngx.ctx.channel_auth = channel_auth

    -- 记录请求日志
    ngx.log(ngx.INFO, "API key ", api_key, " routed to channel ", selected_channel.id)
end

return _M
```

## 5. Node.js管理后台API设计

### 5.1 用户管理API

```javascript
// 用户管理路由
router.get('/users', async (req, res) => {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'status != "deleted"';
    let params = [];

    if (search) {
        whereClause += ' AND (username LIKE ? OR email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }

    const query = `
        SELECT id, username, email, status, quota_requests_per_day,
               current_requests_today, last_quota_reset, created_at
        FROM users
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `;

    params.push(parseInt(limit), offset);

    try {
        const [users] = await db.execute(query, params);

        // 获取每个用户的API密钥数量
        for (let user of users) {
            const [keyCount] = await db.execute(
                'SELECT COUNT(*) as count FROM user_api_keys WHERE user_id = ?',
                [user.id]
            );
            user.api_key_count = keyCount[0].count;
        }

        res.json({
            success: true,
            data: users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: users.length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 创建用户
router.post('/users', async (req, res) => {
    const { username, email, password, quota_requests_per_day = 1000 } = req.body;

    // 验证输入
    if (!username || !email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Username, email, and password are required'
        });
    }

    try {
        // 检查用户名和邮箱是否已存在
        const [existing] = await db.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Username or email already exists'
            });
        }

        // 密码哈希
        const passwordHash = await bcrypt.hash(password, 10);

        // 创建用户
        const [result] = await db.execute(`
            INSERT INTO users (username, email, password_hash, quota_requests_per_day)
            VALUES (?, ?, ?, ?)
        `, [username, email, passwordHash, quota_requests_per_day]);

        res.json({
            success: true,
            data: {
                id: result.insertId,
                username,
                email,
                quota_requests_per_day
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
```

### 5.2 API密钥生成和管理

```javascript
// 生成API密钥
router.post('/api-keys', async (req, res) => {
    const {
        user_id,
        key_name,
        provider_type,
        channel_ids = [],
        allowed_models = [],
        max_requests_per_hour = 100
    } = req.body;

    // 验证输入
    if (!user_id || !key_name || !provider_type) {
        return res.status(400).json({
            success: false,
            error: 'User ID, key name, and provider type are required'
        });
    }

    try {
        // 验证用户存在
        const [user] = await db.execute(
            'SELECT id FROM users WHERE id = ? AND status = "active"',
            [user_id]
        );

        if (user.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found or inactive'
            });
        }

        // 验证渠道存在且类型匹配
        if (channel_ids.length > 0) {
            const [channels] = await db.execute(`
                SELECT id FROM channels
                WHERE id IN (${channel_ids.map(() => '?').join(',')})
                AND provider_type = ? AND status = 'active'
            `, [...channel_ids, provider_type]);

            if (channels.length !== channel_ids.length) {
                return res.status(400).json({
                    success: false,
                    error: 'Some channels are invalid or inactive'
                });
            }
        }

        // 生成API密钥
        const apiKey = generateApiKey(provider_type);

        // 如果是OAuth2类型，生成RSA密钥对
        let publicKey, privateKeyEncrypted;
        if (provider_type === 'vertex') {
            const { publicKey: pub, privateKey: priv } = generateRSAKeyPair();
            publicKey = pub;
            privateKeyEncrypted = encryptPrivateKey(priv);
        }

        // 创建API密钥记录
        const [result] = await db.execute(`
            INSERT INTO user_api_keys (
                user_id, key_name, provider_type, api_key, key_type,
                public_key, private_key_encrypted, channel_ids, allowed_models,
                max_requests_per_hour
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            user_id, key_name, provider_type, apiKey,
            provider_type === 'vertex' ? 'oauth2' : 'bearer',
            publicKey, privateKeyEncrypted,
            JSON.stringify(channel_ids), JSON.stringify(allowed_models),
            max_requests_per_hour
        ]);

        // 创建渠道权重配置
        if (channel_ids.length > 0) {
            const weightValues = channel_ids.map((channelId, index) =>
                `(${result.insertId}, ${channelId}, ${1/(index+1)}, ${index+1})`
            ).join(',');

            await db.execute(`
                INSERT INTO api_key_channel_weights
                (api_key_id, channel_id, weight, priority)
                VALUES ${weightValues}
            `);
        }

        // 更新Redis缓存
        await updateApiKeyCache(result.insertId);

        res.json({
            success: true,
            data: {
                id: result.insertId,
                api_key: apiKey,
                key_name,
                provider_type
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 生成不同provider的API密钥格式
function generateApiKey(providerType) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);

    switch (providerType) {
        case 'vertex':
            // 模拟Vertex AI的OAuth2客户端ID格式
            return `vertex-client-${timestamp}-${random}.apps.googleusercontent.com`;
        case 'azure':
            // 模拟Azure OpenAI的API Key格式
            return `azure-${random}${timestamp.toString(36)}`;
        case 'openai':
            // 模拟OpenAI的API Key格式
            return `sk-${random}${timestamp.toString(36).substring(0, 20)}`;
        case 'claude':
            // 模拟Claude的API Key格式
            return `sk-ant-api03-${random}-${timestamp.toString(36)}`;
        case 'aws_bedrock':
            // 模拟AWS的Access Key格式
            return `AKIA${random.toUpperCase()}${timestamp.toString(36).substring(0, 16).toUpperCase()}`;
        default:
            return `${providerType}-${timestamp}-${random}`;
    }
}

// 生成RSA密钥对（用于OAuth2）
function generateRSAKeyPair() {
    const forge = require('node-forge');
    const keyPair = forge.pki.rsa.generateKeyPair(2048);

    const publicKey = forge.pki.publicKeyToPem(keyPair.publicKey);
    const privateKey = forge.pki.privateKeyToPem(keyPair.privateKey);

    return {
        publicKey: publicKey.replace(/-----BEGIN PUBLIC KEY-----\n|\n-----END PUBLIC KEY-----\n/g, ''),
        privateKey: privateKey
    };
}
```

## 6. 前端管理界面设计要点

### 6.1 用户管理界面
- 用户列表（分页、搜索、筛选）
- 用户配额设置和监控
- 用户状态管理（激活/暂停/删除）
- 用户API密钥概览

### 6.2 渠道管理界面
- 渠道列表（按provider分类）
- 渠道健康状态监控
- 渠道权重配置
- 渠道支持模型配置
- 批量导入渠道

### 6.3 API密钥管理界面
- 密钥生成向导
- 密钥列表和详情
- 渠道权重配置（拖拽调整）
- 模型权限配置
- 使用统计图表

### 6.4 监控仪表板
- 实时请求量监控
- 渠道负载均衡状态
- 错误率和响应时间
- 用户使用统计

## 7. 系统优化建议

### 7.1 当前系统优化点

1. **统一数据库schema**: 合并现有的两个schema，统一使用新的设计
2. **Redis缓存预热**: 系统启动时预加载热点数据到Redis
3. **渠道健康检查**: 定期检查渠道可用性，自动剔除故障渠道
4. **请求限流**: 基于用户和渠道的多级限流
5. **灰度发布**: 支持渠道的灰度上线和下线

### 7.2 性能优化

1. **连接池优化**: MySQL和Redis连接池调优
2. **缓存策略**: 多级缓存，减少数据库查询
3. **异步处理**: 非关键操作异步化（如日志记录）
4. **压缩传输**: 开启gzip压缩
5. **CDN加速**: 静态资源使用CDN

### 7.3 安全增强

1. **API密钥加密**: 存储时使用AES加密
2. **请求签名**: 关键操作添加请求签名验证
3. **IP白名单**: 管理后台支持IP白名单
4. **审计日志**: 记录所有关键操作
5. **定期密钥轮换**: 支持渠道密钥定期轮换

## 8. 部署和运维

### 8.1 Docker Compose优化
```yaml
# 优化后的docker-compose
version: '3.8'

services:
  api-proxy-nginx:
    image: openresty/openresty:alpine
    volumes:
      - ./nginx/nginx.conf:/usr/local/openresty/nginx/conf/nginx.conf:ro
      - ./lua:/usr/local/openresty/lua/:ro
      - ./logs:/var/log/nginx
    environment:
      - REDIS_HOST=api-proxy-redis
      - REDIS_PASSWORD=123456
    depends_on:
      - api-proxy-nodejs
      - api-proxy-redis

  api-proxy-nodejs:
    build: ./nodejs
    environment:
      - NODE_ENV=production
      - DB_HOST=api-proxy-mysql
      - DB_NAME=api_proxy
      - REDIS_HOST=api-proxy-redis
    depends_on:
      - api-proxy-mysql
      - api-proxy-redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8889/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  api-proxy-redis:
    image: redis:7-alpine
    command: redis-server --requirepass 123456 --maxmemory 1gb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data

  api-proxy-mysql:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=root123456
      - MYSQL_DATABASE=api_proxy
      - MYSQL_USER=api_proxy
      - MYSQL_PASSWORD=proxy123456
    volumes:
      - mysql-data:/var/lib/mysql
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
    command: >
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
      --max_connections=1000
      --innodb_buffer_pool_size=512M

volumes:
  redis-data:
  mysql-data:
```

### 8.2 监控和日志

1. **ELK Stack**: Elasticsearch + Logstash + Kibana
2. **Prometheus + Grafana**: 性能监控
3. **Sentry**: 错误追踪
4. **健康检查**: 定期检查所有服务状态

这个设计方案提供了一个完整的大模型API中转平台架构，解决了您提出的所有核心需求，同时保持了系统的可扩展性和高性能。