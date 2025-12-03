-- OAuth2模拟服务数据库初始化脚本
-- 创建时间: 2024-12-03
-- 版本: v1.0.0

-- 设置字符集
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================
-- 1. 客户端应用表
-- =====================================
CREATE TABLE IF NOT EXISTS `clients` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `client_id` VARCHAR(191) NOT NULL UNIQUE,
    `client_secret` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT,
    `redirect_uris` JSON,
    `grant_types` JSON,
    `scopes` JSON,
    `status` ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_client_id` (`client_id`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 2. 服务账号表
-- =====================================
CREATE TABLE IF NOT EXISTS `service_accounts` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `client_id` VARCHAR(191) NOT NULL UNIQUE,
    `email` VARCHAR(191) NOT NULL UNIQUE,
    `private_key` TEXT NOT NULL,
    `private_key_id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT,
    `scopes` JSON,
    `status` ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_client_id` (`client_id`),
    INDEX `idx_email` (`email`),
    INDEX `idx_project_id` (`project_id`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 3. 访问令牌表
-- =====================================
CREATE TABLE IF NOT EXISTS `access_tokens` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `token_hash` VARCHAR(64) NOT NULL UNIQUE,
    `token` TEXT NOT NULL,
    `type` ENUM('Bearer') DEFAULT 'Bearer',
    `client_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191),
    `scopes` JSON,
    `expires_at` TIMESTAMP NOT NULL,
    `issued_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `status` ENUM('active', 'revoked', 'expired') DEFAULT 'active',
    `last_accessed` TIMESTAMP NULL,
    `access_count` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_token_hash` (`token_hash`),
    INDEX `idx_client_id` (`client_id`),
    INDEX `idx_expires_at` (`expires_at`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 4. 刷新令牌表
-- =====================================
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `token_hash` VARCHAR(64) NOT NULL UNIQUE,
    `token` TEXT NOT NULL,
    `access_token_id` INT NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191),
    `scopes` JSON,
    `expires_at` TIMESTAMP NOT NULL,
    `issued_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `status` ENUM('active', 'revoked', 'expired') DEFAULT 'active',
    `last_used` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`access_token_id`) REFERENCES `access_tokens`(`id`) ON DELETE CASCADE,
    INDEX `idx_token_hash` (`token_hash`),
    INDEX `idx_client_id` (`client_id`),
    INDEX `idx_expires_at` (`expires_at`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 5. 授权码表
-- =====================================
CREATE TABLE IF NOT EXISTS `authorization_codes` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL UNIQUE,
    `client_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `redirect_uri` TEXT NOT NULL,
    `scopes` JSON,
    `state` VARCHAR(191),
    `code_challenge` VARCHAR(191),
    `code_challenge_method` VARCHAR(10),
    `expires_at` TIMESTAMP NOT NULL,
    `used` BOOLEAN DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_code` (`code`),
    INDEX `idx_client_id` (`client_id`),
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 6. Token映射表（核心表）
-- =====================================
CREATE TABLE IF NOT EXISTS `token_mappings` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `client_token` VARCHAR(191) NOT NULL UNIQUE,
    `google_access_token` TEXT NOT NULL,
    `google_refresh_token` TEXT,
    `client_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191),
    `scopes` JSON,
    `expires_at` TIMESTAMP NOT NULL,
    `cache_version` BIGINT DEFAULT 1,
    `status` ENUM('active', 'revoked', 'expired') DEFAULT 'active',
    `last_accessed` TIMESTAMP NULL,
    `access_count` INT DEFAULT 0,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_client_token` (`client_token`),
    INDEX `idx_client_id` (`client_id`),
    INDEX `idx_expires_at` (`expires_at`),
    INDEX `idx_status` (`status`),
    INDEX `idx_cache_version` (`cache_version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 7. 用户会话表
-- =====================================
CREATE TABLE IF NOT EXISTS `user_sessions` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `session_id` VARCHAR(191) NOT NULL UNIQUE,
    `user_id` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `ip_address` VARCHAR(45),
    `user_agent` TEXT,
    `scopes` JSON,
    `expires_at` TIMESTAMP NOT NULL,
    `status` ENUM('active', 'expired', 'revoked') DEFAULT 'active',
    `last_accessed` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_session_id` (`session_id`),
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_client_id` (`client_id`),
    INDEX `idx_expires_at` (`expires_at`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 8. API访问日志表
-- =====================================
CREATE TABLE IF NOT EXISTS `api_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `request_id` VARCHAR(191) NOT NULL UNIQUE,
    `client_id` VARCHAR(191),
    `user_id` VARCHAR(191),
    `endpoint` VARCHAR(191) NOT NULL,
    `method` VARCHAR(10) NOT NULL,
    `status_code` INT NOT NULL,
    `response_time` INT,
    `ip_address` VARCHAR(45),
    `user_agent` TEXT,
    `request_headers` JSON,
    `request_body` TEXT,
    `response_headers` JSON,
    `error_message` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_request_id` (`request_id`),
    INDEX `idx_client_id` (`client_id`),
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_endpoint` (`endpoint`),
    INDEX `idx_status_code` (`status_code`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 插入初始数据
-- =====================================

-- 插入测试客户端
INSERT IGNORE INTO `clients` (`client_id`, `client_secret`, `name`, `description`, `redirect_uris`, `grant_types`, `scopes`) VALUES
('test_client_id', 'test_client_secret', 'Test Client', 'Test client for development', '["http://localhost:8889/callback"]', '["client_credentials", "authorization_code", "refresh_token"]', '["openid", "profile", "email"]'),
('gemini_test', 'gemini_secret', 'Gemini Test Client', 'Test client for Gemini AI proxy', '["http://localhost:8889/callback"]', '["client_credentials", "urn:ietf:params:oauth:grant-type:jwt-bearer"]', '["https://www.googleapis.com/auth/cloud-platform"]');

-- 插入测试服务账号
INSERT IGNORE INTO `service_accounts` (`client_id`, `email`, `private_key`, `private_key_id`, `project_id`, `name`, `description`, `scopes`) VALUES
('gemini_service_account', 'gemini-test@example.iam.gserviceaccount.com', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB\nTestPrivateKeyForDevelopmentOnly1234567890\n-----END PRIVATE KEY-----', 'test_key_id_12345', 'test-project-12345', 'Gemini Test Service Account', 'Test service account for development', '["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/aiplatform"]');

-- =====================================
-- 设置外键约束
-- =====================================
-- 使用 IF NOT EXISTS 逻辑的外键添加（通过检查约束是否存在）
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
     AND CONSTRAINT_NAME = 'fk_access_tokens_client'
     AND TABLE_NAME = 'access_tokens') > 0,
    'SELECT 1', -- 约束已存在，不执行
    'ALTER TABLE `access_tokens` ADD CONSTRAINT `fk_access_tokens_client` FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON DELETE CASCADE'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
     AND CONSTRAINT_NAME = 'fk_refresh_tokens_client'
     AND TABLE_NAME = 'refresh_tokens') > 0,
    'SELECT 1', -- 约束已存在，不执行
    'ALTER TABLE `refresh_tokens` ADD CONSTRAINT `fk_refresh_tokens_client` FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON DELETE CASCADE'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
     AND CONSTRAINT_NAME = 'fk_auth_codes_client'
     AND TABLE_NAME = 'authorization_codes') > 0,
    'SELECT 1', -- 约束已存在，不执行
    'ALTER TABLE `authorization_codes` ADD CONSTRAINT `fk_auth_codes_client` FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON DELETE CASCADE'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
     AND CONSTRAINT_NAME = 'fk_token_mappings_client'
     AND TABLE_NAME = 'token_mappings') > 0,
    'SELECT 1', -- 约束已存在，不执行
    'ALTER TABLE `token_mappings` ADD CONSTRAINT `fk_token_mappings_client` FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON DELETE CASCADE'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
     AND CONSTRAINT_NAME = 'fk_user_sessions_client'
     AND TABLE_NAME = 'user_sessions') > 0,
    'SELECT 1', -- 约束已存在，不执行
    'ALTER TABLE `user_sessions` ADD CONSTRAINT `fk_user_sessions_client` FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON DELETE CASCADE'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================
-- 创建视图
-- =====================================

-- 活跃Token统计视图
CREATE OR REPLACE VIEW `active_tokens_stats` AS
SELECT
    c.client_id,
    c.name as client_name,
    COUNT(DISTINCT at.id) as active_access_tokens,
    COUNT(DISTINCT rt.id) as active_refresh_tokens,
    COUNT(DISTINCT tm.id) as active_token_mappings
FROM clients c
LEFT JOIN access_tokens at ON c.client_id = at.client_id AND at.status = 'active' AND at.expires_at > NOW()
LEFT JOIN refresh_tokens rt ON c.client_id = rt.client_id AND rt.status = 'active' AND rt.expires_at > NOW()
LEFT JOIN token_mappings tm ON c.client_id = tm.client_id AND tm.status = 'active' AND tm.expires_at > NOW()
WHERE c.status = 'active'
GROUP BY c.client_id, c.name;

-- API访问统计视图
CREATE OR REPLACE VIEW `api_access_stats` AS
SELECT
    DATE(created_at) as date,
    endpoint,
    COUNT(*) as request_count,
    AVG(response_time) as avg_response_time,
    COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
FROM api_logs
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(created_at), endpoint
ORDER BY date DESC, request_count DESC;

-- =====================================
-- 创建存储过程
-- =====================================

-- 删除已存在的存储过程
DROP PROCEDURE IF EXISTS `CleanupExpiredTokens`;

-- 清理过期Token的存储过程
DELIMITER //
CREATE PROCEDURE `CleanupExpiredTokens`()
BEGIN
    DECLARE cleaned_count INT DEFAULT 0;

    -- 清理过期的访问令牌
    UPDATE access_tokens SET status = 'expired'
    WHERE expires_at <= NOW() AND status = 'active';
    SET cleaned_count = cleaned_count + ROW_COUNT();

    -- 清理过期的刷新令牌
    UPDATE refresh_tokens SET status = 'expired'
    WHERE expires_at <= NOW() AND status = 'active';
    SET cleaned_count = cleaned_count + ROW_COUNT();

    -- 清理过期的授权码
    DELETE FROM authorization_codes WHERE expires_at <= NOW();
    SET cleaned_count = cleaned_count + ROW_COUNT();

    -- 清理过期的Token映射
    UPDATE token_mappings SET status = 'expired'
    WHERE expires_at <= NOW() AND status = 'active';
    SET cleaned_count = cleaned_count + ROW_COUNT();

    -- 清理过期的用户会话
    UPDATE user_sessions SET status = 'expired'
    WHERE expires_at <= NOW() AND status = 'active';
    SET cleaned_count = cleaned_count + ROW_COUNT();

    SELECT cleaned_count as tokens_cleaned;
END //
DELIMITER ;

-- =====================================
-- 创建触发器
-- =====================================

-- 删除已存在的触发器
DROP TRIGGER IF EXISTS `before_token_mapping_update`;

-- Token映射更新时自动增加版本号
DELIMITER //
CREATE TRIGGER `before_token_mapping_update`
BEFORE UPDATE ON `token_mappings`
FOR EACH ROW
BEGIN
    IF NEW.google_access_token != OLD.google_access_token OR NEW.status != OLD.status THEN
        SET NEW.cache_version = OLD.cache_version + 1;
    END IF;
    SET NEW.updated_at = CURRENT_TIMESTAMP;
END //
DELIMITER ;

-- 删除已存在的触发器
DROP TRIGGER IF EXISTS `before_access_token_update`;

-- 访问令牌访问计数更新
DELIMITER //
CREATE TRIGGER `before_access_token_update`
BEFORE UPDATE ON `access_tokens`
FOR EACH ROW
BEGIN
    IF NEW.last_accessed != OLD.last_accessed THEN
        SET NEW.access_count = OLD.access_count + 1;
    END IF;
END //
DELIMITER ;

-- =====================================
-- 8. 示例数据插入
-- =====================================

-- 插入示例客户端
INSERT IGNORE INTO `clients` (`client_id`, `client_secret`, `name`, `description`, `redirect_uris`, `grant_types`, `scopes`) VALUES
('test-client-1', 'test-secret-1', '测试客户端1', '用于测试的OAuth2客户端',
 '["http://localhost:3000/callback", "http://localhost:8889/callback"]',
 '["client_credentials", "authorization_code", "refresh_token"]',
 '["openid", "profile", "email", "https://www.googleapis.com/auth/cloud-platform"]'),
('test-client-2', 'test-secret-2', '测试客户端2', '另一个测试客户端',
 '["http://localhost:3001/callback"]',
 '["client_credentials"]',
 '["https://www.googleapis.com/auth/cloud-platform"]');

-- 插入示例服务账号
INSERT IGNORE INTO `service_accounts` (`client_id`, `email`, `private_key`, `private_key_id`, `project_id`, `name`, `description`, `scopes`) VALUES
('service-account-1', 'test-service-account-1@oauth2-mock.iam.gserviceaccount.com',
 '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----',
 'key-id-1', 'test-project-1', '测试服务账号1', '用于测试的服务账号',
 '["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/pubsub"]');

-- =====================================
-- 完成初始化
-- =====================================
SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Database initialization completed successfully!' as message;