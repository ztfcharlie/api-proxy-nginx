-- OAuth2 模拟服务数据库结构
-- 版本: 1.0.0
-- 字符集: utf8mb4
-- 时区: +08:00

-- 创建数据库
CREATE DATABASE IF NOT EXISTS oauth2_mock
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE oauth2_mock;

-- 1. 客户端表（对应 map-config.json 中的客户端信息）
CREATE TABLE clients (
    id INT PRIMARY KEY AUTO_INCREMENT,
    client_token VARCHAR(255) UNIQUE NOT NULL COMMENT '客户端认证令牌',
    service_type ENUM('google', 'claude', 'vertex') DEFAULT 'google' COMMENT '服务类型',
    enable BOOLEAN DEFAULT TRUE COMMENT '是否启用',
    description TEXT COMMENT '描述信息',
    config_json JSON COMMENT '客户端配置（JSON格式）',
    weight INT DEFAULT 1 COMMENT '负载均衡权重',
    rate_limit INT DEFAULT 1000 COMMENT '速率限制（每小时）',
    created_by VARCHAR(100) COMMENT '创建者',
    updated_by VARCHAR(100) COMMENT '更新者',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_client_token (client_token),
    INDEX idx_service_type (service_type),
    INDEX idx_enable (enable),
    INDEX idx_created_at (created_at)
) COMMENT '客户端信息表';

-- 2. 服务账号表（对应服务账号 JSON 文件）
CREATE TABLE server_accounts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    client_id INT NOT NULL COMMENT '关联的客户端ID',
    key_filename VARCHAR(255) NOT NULL COMMENT '服务账号文件名',
    project_id VARCHAR(255) NOT NULL COMMENT 'Google Cloud 项目ID',
    private_key_id VARCHAR(255) NOT NULL COMMENT '私钥ID',
    client_email VARCHAR(255) NOT NULL COMMENT '服务账号邮箱',
    client_id_google VARCHAR(255) NOT NULL COMMENT 'Google 客户端ID',
    private_key_encrypted TEXT NOT NULL COMMENT '加密的私钥',
    key_weight INT DEFAULT 1 COMMENT '负载均衡权重',
    enable BOOLEAN DEFAULT TRUE COMMENT '是否启用',
    file_path VARCHAR(500) COMMENT '文件存储路径',
    file_hash VARCHAR(64) COMMENT '文件哈希值',
    expires_at TIMESTAMP COMMENT '过期时间（NULL为永不过期）',
    created_by VARCHAR(100) COMMENT '创建者',
    updated_by VARCHAR(100) COMMENT '更新者',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    INDEX idx_client_id (client_id),
    INDEX idx_key_filename (key_filename),
    INDEX idx_project_id (project_id),
    INDEX idx_client_email (client_email),
    INDEX idx_client_id_google (client_id_google),
    INDEX idx_enable (enable),
    INDEX idx_expires_at (expires_at),
    INDEX idx_key_weight (key_weight),
    UNIQUE KEY unique_client_key (client_id, key_filename)
) COMMENT '服务账号信息表';

-- 3. AI 模型配置表（对应支持的 AI 模型）
CREATE TABLE models (
    id INT PRIMARY KEY AUTO_INCREMENT,
    service_account_id INT NOT NULL COMMENT '关联的服务账号ID',
    model_name VARCHAR(255) NOT NULL COMMENT '模型名称',
    api_domain VARCHAR(255) NOT NULL COMMENT 'API域名',
    service_type ENUM('google', 'claude', 'vertex') NOT NULL COMMENT '服务类型',
    enable BOOLEAN DEFAULT TRUE COMMENT '是否启用',
    weight INT DEFAULT 1 COMMENT '负载均衡权重',
    model_config JSON COMMENT '模型配置参数',
    rate_limit INT DEFAULT 100 COMMENT '模型速率限制',
    created_by VARCHAR(100) COMMENT '创建者',
    updated_by VARCHAR(100) COMMENT '更新者',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    FOREIGN KEY (service_account_id) REFERENCES server_accounts(id) ON DELETE CASCADE,
    INDEX idx_service_account_id (service_account_id),
    INDEX idx_model_name (model_name),
    INDEX idx_api_domain (api_domain),
    INDEX idx_service_type (service_type),
    INDEX idx_enable (enable),
    INDEX idx_weight (weight),
    UNIQUE KEY unique_account_model (service_account_id, model_name)
) COMMENT 'AI模型配置表';

-- 4. 令牌映射表（核心映射关系：客户端token ↔ Google access_token）
CREATE TABLE token_mappings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    client_token VARCHAR(255) NOT NULL COMMENT '客户端认证令牌',
    server_account_id INT COMMENT '关联的服务账号ID',
    google_access_token TEXT NOT NULL COMMENT '模拟的Google访问令牌',
    google_refresh_token TEXT COMMENT '模拟的Google刷新令牌',
    token_type VARCHAR(50) DEFAULT 'Bearer' COMMENT '令牌类型',
    expires_at TIMESTAMP NOT NULL COMMENT '过期时间',
    scope VARCHAR(1000) COMMENT '访问权限范围',

    -- 缓存控制字段
    cache_version BIGINT DEFAULT 1 COMMENT '缓存版本号（用于缓存一致性）',
    status ENUM('active', 'revoked', 'expired') DEFAULT 'active' COMMENT '令牌状态',
    revoked_at TIMESTAMP NULL COMMENT '撤销时间',
    revoke_reason VARCHAR(255) COMMENT '撤销原因',
    last_used_at TIMESTAMP NULL COMMENT '最后使用时间',
    usage_count INT DEFAULT 0 COMMENT '使用次数',

    -- 关联信息
    request_ip VARCHAR(45) COMMENT '请求IP',
    user_agent TEXT COMMENT '用户代理',
    grant_type VARCHAR(50) COMMENT '授权类型',

    created_by VARCHAR(100) COMMENT '创建者',
    updated_by VARCHAR(100) COMMENT '更新者',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    FOREIGN KEY (server_account_id) REFERENCES server_accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (client_token) REFERENCES clients(client_token) ON DELETE CASCADE,

    INDEX idx_google_access_token (google_access_token(100)),
    INDEX idx_cache_version (cache_version),
    INDEX idx_status (status),
    INDEX idx_expires_at (expires_at),
    INDEX idx_client_token (client_token),
    INDEX idx_server_account_id (server_account_id),
    INDEX idx_last_used_at (last_used_at),
    INDEX idx_created_at (created_at),
    UNIQUE KEY unique_active_token (google_access_token(255), status)
) COMMENT '令牌映射关系表';

-- 5. OAuth2 认证日志表（记录所有认证请求）
CREATE TABLE oauth_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    client_id INT COMMENT '关联的客户端ID',
    server_account_id INT COMMENT '关联的服务账号ID',
    token_mapping_id INT COMMENT '关联的令牌映射ID',

    -- 请求信息
    request_type ENUM('auth_code', 'jwt_bearer', 'refresh_token', 'client_credentials') NOT NULL COMMENT '请求类型',
    request_method VARCHAR(10) NOT NULL DEFAULT 'POST' COMMENT 'HTTP方法',
    request_url VARCHAR(500) NOT NULL COMMENT '请求URL',
    request_headers JSON COMMENT '请求头',
    request_body JSON COMMENT '请求体',

    -- 响应信息
    status_code INT NOT NULL COMMENT 'HTTP状态码',
    response_headers JSON COMMENT '响应头',
    response_body JSON COMMENT '响应体',
    success BOOLEAN NOT NULL COMMENT '是否成功',
    error_code VARCHAR(100) COMMENT '错误代码',
    error_message TEXT COMMENT '错误消息',

    -- 性能信息
    processing_time INT COMMENT '处理时间（毫秒）',
    token_gen_time INT COMMENT '令牌生成时间（毫秒）',
    db_query_time INT COMMENT '数据库查询时间（毫秒）',

    -- 客户端信息
    request_ip VARCHAR(45) COMMENT '请求IP',
    user_agent TEXT COMMENT '用户代理',
    referer VARCHAR(500) COMMENT '来源页面',

    -- 时间信息
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    FOREIGN KEY (server_account_id) REFERENCES server_accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (token_mapping_id) REFERENCES token_mappings(id) ON DELETE SET NULL,

    INDEX idx_client_id (client_id),
    INDEX idx_server_account_id (server_account_id),
    INDEX idx_token_mapping_id (token_mapping_id),
    INDEX idx_request_type (request_type),
    INDEX idx_status_code (status_code),
    INDEX idx_success (success),
    INDEX idx_created_at (created_at),
    INDEX idx_request_ip (request_ip),
    INDEX idx_error_code (error_code)
) COMMENT 'OAuth2认证日志表';

-- 6. API 使用统计表（聚合统计信息）
CREATE TABLE api_usage_stats (
    id INT PRIMARY KEY AUTO_INCREMENT,
    client_id INT NOT NULL COMMENT '关联的客户端ID',
    model_name VARCHAR(255) NOT NULL COMMENT '模型名称',

    -- 统计日期和维度
    stats_date DATE NOT NULL COMMENT '统计日期',
    stats_hour TINYINT COMMENT '统计小时（NULL表示按天统计）',

    -- 请求数量统计
    total_requests INT DEFAULT 0 COMMENT '总请求数',
    success_requests INT DEFAULT 0 COMMENT '成功请求数',
    failed_requests INT DEFAULT 0 COMMENT '失败请求数',
    rate_limited_requests INT DEFAULT 0 COMMENT '被限流的请求数',

    -- Token 使用统计
    tokens_generated INT DEFAULT 0 COMMENT '生成的令牌数',
    tokens_refreshed INT DEFAULT 0 COMMENT '刷新的令牌数',
    tokens_revoked INT DEFAULT 0 COMMENT '撤销的令牌数',

    -- 性能统计
    avg_response_time DECIMAL(10,2) DEFAULT 0 COMMENT '平均响应时间（毫秒）',
    min_response_time INT DEFAULT 0 COMMENT '最小响应时间（毫秒）',
    max_response_time INT DEFAULT 0 COMMENT '最大响应时间（毫秒）',

    -- 流量统计
    total_bytes_sent BIGINT DEFAULT 0 COMMENT '总发送字节数',
    total_bytes_received BIGINT DEFAULT 0 COMMENT '总接收字节数',

    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,

    UNIQUE KEY unique_stats_key (client_id, model_name, stats_date, stats_hour),
    INDEX idx_client_id (client_id),
    INDEX idx_model_name (model_name),
    INDEX idx_stats_date (stats_date),
    INDEX idx_total_requests (total_requests),
    INDEX idx_created_at (created_at)
) COMMENT 'API使用统计表';

-- 7. 系统配置表（管理OAuth2服务的配置）
CREATE TABLE system_config (
    id INT PRIMARY KEY AUTO_INCREMENT,
    config_key VARCHAR(255) UNIQUE NOT NULL COMMENT '配置键',
    config_value TEXT COMMENT '配置值',
    config_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string' COMMENT '配置类型',
    config_group VARCHAR(100) DEFAULT 'general' COMMENT '配置分组',
    description TEXT COMMENT '配置描述',
    is_encrypted BOOLEAN DEFAULT FALSE COMMENT '是否加密存储',
    is_readonly BOOLEAN DEFAULT FALSE COMMENT '是否只读',
    created_by VARCHAR(100) COMMENT '创建者',
    updated_by VARCHAR(100) COMMENT '更新者',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_config_key (config_key),
    INDEX idx_config_group (config_group),
    INDEX idx_config_type (config_type)
) COMMENT '系统配置表';

-- 8. 缓存管理表（管理分布式缓存的元数据）
CREATE TABLE cache_metadata (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cache_key VARCHAR(500) NOT NULL COMMENT '缓存键',
    cache_type ENUM('access_token', 'refresh_token', 'client_token', 'config', 'session') NOT NULL COMMENT '缓存类型',
    cache_value_hash VARCHAR(64) COMMENT '缓存值哈希（用于一致性检查）',
    expires_at TIMESTAMP NOT NULL COMMENT '过期时间',
    status ENUM('valid', 'invalid', 'expired') DEFAULT 'valid' COMMENT '缓存状态',
    version BIGINT DEFAULT 1 COMMENT '缓存版本',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_cache_key (cache_key),
    INDEX idx_cache_type (cache_type),
    INDEX idx_expires_at (expires_at),
    INDEX idx_status (status),
    INDEX idx_version (version),
    UNIQUE KEY unique_cache_key_type (cache_key(255), cache_type)
) COMMENT '缓存元数据表';

-- 插入默认系统配置
INSERT INTO system_config (config_key, config_value, config_type, config_group, description) VALUES
('oauth2.access_token.expires_in', '3600', 'number', 'oauth2', '访问令牌过期时间（秒）'),
('oauth2.refresh_token.expires_in', '86400', 'number', 'oauth2', '刷新令牌过期时间（秒）'),
('oauth2.code.expires_in', '600', 'number', 'oauth2', '授权码过期时间（秒）'),
('oauth2.issuer', 'http://localhost:8889', 'string', 'oauth2', 'OAuth2颁发者'),
('oauth2.audience', 'api.yourdomain.com', 'string', 'oauth2', 'OAuth2受众'),
('cache.access_token.ttl', '3600', 'number', 'cache', '访问令牌缓存时间（秒）'),
('cache.refresh_token.ttl', '86400', 'number', 'cache', '刷新令牌缓存时间（秒）'),
('cache.cleanup_interval', '300', 'number', 'cache', '缓存清理间隔（秒）'),
('rate_limit.window_ms', '900000', 'number', 'security', '速率限制时间窗口（毫秒）'),
('rate_limit.max_requests', '1000', 'number', 'security', '速率限制最大请求数'),
('log.level', 'info', 'string', 'logging', '日志级别'),
('log.max_size', '20m', 'string', 'logging', '日志文件最大大小'),
('log.max_files', '14d', 'string', 'logging', '日志文件保留时间'),
('security.enable_encryption', 'true', 'boolean', 'security', '是否启用加密'),
('security.jwt_algorithm', 'RS256', 'string', 'security', 'JWT算法'),
('monitoring.enable_metrics', 'true', 'boolean', 'monitoring', '是否启用监控指标'),
('monitoring.enable_profiling', 'false', 'boolean', 'monitoring', '是否启用性能分析');

-- 创建视图：客户端详细信息
CREATE VIEW client_details AS
SELECT
    c.*,
    COUNT(sa.id) as server_account_count,
    COUNT(t.id) as active_token_count,
    MAX(t.last_used_at) as last_activity_at,
    GROUP_CONCAT(DISTINCT sa.project_id) as project_ids,
    GROUP_CONCAT(DISTINCT m.model_name) as supported_models
FROM clients c
LEFT JOIN server_accounts sa ON c.id = sa.client_id AND sa.enable = TRUE
LEFT JOIN token_mappings t ON c.client_token = t.client_token AND t.status = 'active' AND t.expires_at > NOW()
LEFT JOIN models m ON sa.id = m.service_account_id AND m.enable = TRUE
WHERE c.enable = TRUE
GROUP BY c.id;

-- 创建视图：令牌使用统计
CREATE VIEW token_usage_summary AS
SELECT
    DATE(created_at) as usage_date,
    client_token,
    COUNT(*) as total_requests,
    SUM(CASE WHEN success = TRUE THEN 1 ELSE 0 END) as successful_requests,
    AVG(processing_time) as avg_processing_time,
    MAX(processing_time) as max_processing_time,
    MIN(processing_time) as min_processing_time,
    COUNT(DISTINCT request_ip) as unique_ips
FROM oauth_logs
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(created_at), client_token;

-- 创建存储过程：清理过期令牌
DELIMITER //
CREATE PROCEDURE CleanupExpiredTokens()
BEGIN
    DECLARE rows_affected INT;

    -- 更新过期的令牌状态
    UPDATE token_mappings
    SET status = 'expired',
        cache_version = cache_version + 1,
        updated_at = NOW()
    WHERE status = 'active' AND expires_at < NOW();

    SET rows_affected = ROW_COUNT();

    -- 删除30天前的过期令牌记录
    DELETE FROM token_mappings
    WHERE status = 'expired' AND expires_at < DATE_SUB(NOW(), INTERVAL 30 DAY);

    -- 记录清理日志
    INSERT INTO oauth_logs (request_type, status_code, success, error_message, created_at)
    VALUES ('jwt_bearer', 200, TRUE, CONCAT('Cleaned up ', rows_affected, ' expired tokens'), NOW());

    SELECT CONCAT('Cleaned up ', rows_affected, ' expired tokens') as result;
END //
DELIMITER ;

-- 创建存储过程：生成使用统计
DELIMITER //
CREATE PROCEDURE GenerateUsageStats(IN stats_date_param DATE)
BEGIN
    -- 为每个客户端生成每日统计
    INSERT INTO api_usage_stats (
        client_id, model_name, stats_date, total_requests, success_requests,
        failed_requests, avg_response_time, created_at, updated_at
    )
    SELECT
        c.id,
        COALESCE(m.model_name, 'unknown'),
        stats_date_param,
        COUNT(*) as total_requests,
        SUM(CASE WHEN ol.success = TRUE THEN 1 ELSE 0 END) as success_requests,
        SUM(CASE WHEN ol.success = FALSE THEN 1 ELSE 0 END) as failed_requests,
        AVG(ol.processing_time) as avg_response_time,
        NOW(),
        NOW()
    FROM oauth_logs ol
    JOIN clients c ON ol.client_id = c.id
    LEFT JOIN token_mappings tm ON ol.token_mapping_id = tm.id
    LEFT JOIN models m ON tm.server_account_id = m.service_account_id
    WHERE DATE(ol.created_at) = stats_date_param
    GROUP BY c.id, m.model_name
    ON DUPLICATE KEY UPDATE
        total_requests = VALUES(total_requests),
        success_requests = VALUES(success_requests),
        failed_requests = VALUES(failed_requests),
        avg_response_time = VALUES(avg_response_time),
        updated_at = NOW();

    SELECT CONCAT('Generated usage stats for ', stats_date_param) as result;
END //
DELIMITER ;

-- 创建事件：定时清理过期数据
SET GLOBAL event_scheduler = ON;

CREATE EVENT IF NOT EXISTS cleanup_expired_tokens_event
ON SCHEDULE EVERY 1 HOUR
STARTS CURRENT_TIMESTAMP
DO CALL CleanupExpiredTokens();

CREATE EVENT IF NOT EXISTS generate_daily_stats_event
ON SCHEDULE EVERY 1 DAY
STARTS TIMESTAMP(DATE(NOW()) + INTERVAL 1 DAY, '00:05:00')
DO CALL GenerateUsageStats(DATE_SUB(NOW(), INTERVAL 1 DAY));

-- 设置字符集和时区
SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- 数据库创建完成
SELECT 'OAuth2 Mock Service Database initialized successfully' as status;