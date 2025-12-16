-- ==========================================
-- Universal AI Gateway 全量数据库结构 (Schema Full)
-- 版本: 3.2 (Consolidated)
-- 支持: Vertex, Azure, OpenAI, AWS, Anthropic
-- 功能: 多渠道路由、权重负载、模型RPM限制、虚拟令牌管理
-- 整理时间: 2025-12-07
-- ==========================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 预先清除所有表（解决外键依赖导致的 Drop 失败）
DROP TABLE IF EXISTS `sys_token_routes`;
DROP TABLE IF EXISTS `sys_virtual_tokens`;
DROP TABLE IF EXISTS `sys_users`;
DROP TABLE IF EXISTS `sys_channels`;
DROP TABLE IF EXISTS `sys_models`;
DROP TABLE IF EXISTS `sys_request_logs`;
DROP TABLE IF EXISTS `sys_async_tasks`;

-- ----------------------------
-- 1. 系统用户表 (sys_users)
-- ----------------------------
DROP TABLE IF EXISTS `sys_users`;
CREATE TABLE `sys_users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `password_hash` varchar(255) NOT NULL DEFAULT '' COMMENT '密码哈希 (bcrypt)',
  `role` varchar(20) DEFAULT 'user' COMMENT 'admin | user',
  `email` varchar(100) DEFAULT NULL,
  `status` tinyint(4) DEFAULT 1 COMMENT '1:启用, 0:禁用',
  `remark` text COMMENT '备注',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ----------------------------
-- 2. 真实渠道表 (sys_channels)
-- ----------------------------
DROP TABLE IF EXISTS `sys_channels`;
CREATE TABLE `sys_channels` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '渠道名称 (如: Google Vertex US-Central)',
  `type` varchar(50) NOT NULL COMMENT '类型: vertex, azure, openai, anthropic, aws_bedrock',
  
  -- 核心凭证
  `credentials` longtext COMMENT 'API Key 或 Service Account JSON 内容',
  
  -- 额外配置 (JSON)
  -- Azure: { "endpoint": "https://xxx.openai.azure.com", "api_version": "2023-05-15" }
  -- AWS: { "region": "us-east-1", "access_key_id": "...", "secret_access_key": "..." }
  `extra_config` json DEFAULT NULL,

  -- 模型配置 (JSON)
  -- 定义该渠道支持哪些模型以及物理限制
  -- { "gpt-4": { "rpm": 1000 }, "claude-2": {} }
  `models_config` json DEFAULT NULL,

  -- 运行时状态
  `current_access_token` text COMMENT 'Vertex/AWS 自动刷新的临时 Token',
  `token_expires_at` timestamp NULL DEFAULT NULL,
  
  `status` tinyint(4) DEFAULT 1 COMMENT '1:启用, 0:禁用',
  `last_error` text COMMENT '最后一次健康检查或刷新错误',
  
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ----------------------------
-- 3. 虚拟令牌表 (sys_virtual_tokens)
-- ----------------------------
DROP TABLE IF EXISTS `sys_virtual_tokens`;
CREATE TABLE `sys_virtual_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `name` varchar(100) DEFAULT NULL COMMENT '令牌备注 (如: 测试项目Key)',
  
  -- 令牌类型 (决定客户端调用的协议格式)
  -- 必须与 sys_channels.type 兼容。
  -- 例如 type='azure'，则生成的 token_key 必须用于 Azure 兼容接口。
  `type` varchar(50) NOT NULL COMMENT 'azure, openai, vertex',
  
  -- 虚拟凭证
  -- OpenAI/Azure: sk-virtual-xxxx (Header: api-key / Authorization)
  -- Vertex: 这里存 client_email (用于 OAuth2 JWT 匹配)
  `token_key` varchar(255) NOT NULL COMMENT '客户端标识 Key',
  
  -- Vertex 专用: 存储生成的 RSA 私钥 (仅用于 Vertex 模拟)
  -- 其他类型此字段为空
  `token_secret` text COMMENT 'RSA Private Key (PEM)',
  `public_key` text COMMENT 'RSA Public Key (PEM) 用于验证 JWT',
  
  -- 限制配置 (JSON)
  -- { 
  --   "allowed_models": ["gpt-4", "gpt-3.5"], 
  --   "model_rpm": { "gpt-4": 500 },
  --   "qps": 10
  -- }
  `limit_config` json DEFAULT NULL,

  `status` tinyint(4) DEFAULT 1 COMMENT '1:启用, 0:禁用',
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL COMMENT '过期时间',
  
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token_key` (`token_key`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_vtoken_user` FOREIGN KEY (`user_id`) REFERENCES `sys_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ----------------------------
-- 4. 路由规则表 (sys_token_routes)
-- ----------------------------
DROP TABLE IF EXISTS `sys_token_routes`;
CREATE TABLE `sys_token_routes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `virtual_token_id` int(11) NOT NULL,
  `channel_id` int(11) NOT NULL,
  
  `weight` int(11) DEFAULT 10 COMMENT '负载均衡权重 (1-100)',
  `priority` int(11) DEFAULT 0 COMMENT '优先级 (暂留, 高优先级先用)',
  
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_route` (`virtual_token_id`,`channel_id`),
  KEY `idx_channel` (`channel_id`),
  CONSTRAINT `fk_route_token` FOREIGN KEY (`virtual_token_id`) REFERENCES `sys_virtual_tokens` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_route_channel` FOREIGN KEY (`channel_id`) REFERENCES `sys_channels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- 5. 模型表 (sys_models)
-- ----------------------------
DROP TABLE IF EXISTS `sys_models`;
CREATE TABLE `sys_models` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `provider` varchar(512) NOT NULL COMMENT '厂商: openai, google, anthropic, qwen, deepseek',
  `name` varchar(100) NOT NULL COMMENT '模型名称',
  `price_input` decimal(12,6) DEFAULT 0.000000 COMMENT '百万Token输入价格',
  `price_output` decimal(12,6) DEFAULT 0.000000 COMMENT '百万Token输出价格',
  `price_cache` decimal(12,6) DEFAULT 0.000000 COMMENT '百万Token缓存价格',
  `price_time` decimal(12,6) DEFAULT 0.000000 COMMENT '每秒价格',
  `price_request` decimal(12,6) DEFAULT 0.000000 COMMENT '每次请求价格',
  `default_rpm` int(11) DEFAULT 1000 COMMENT '默认RPM限制',
  `status` tinyint(4) DEFAULT 1 COMMENT '1:启用, 0:禁用',
  `is_async` tinyint(4) DEFAULT 0 COMMENT '0不是异步模型 1异步模型',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider_name` (`provider`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- 6. 请求日志表 (sys_request_logs)
-- ----------------------------
DROP TABLE IF EXISTS `sys_request_logs`;
CREATE TABLE `sys_request_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `request_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `channel_id` int(11) DEFAULT NULL,
  `token_key` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'User Virtual Token',
  `model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `request_uri` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Full Request URI',
  `status_code` int(11) NOT NULL,
  `duration_ms` int(11) DEFAULT 0 COMMENT 'Total request duration',
  `upstream_duration_ms` int(11) DEFAULT 0 COMMENT 'Upstream response time',
  `prompt_tokens` int(11) DEFAULT 0,
  `completion_tokens` int(11) DEFAULT 0,
  `total_tokens` int(11) DEFAULT 0,
  `cost` decimal(24,12) DEFAULT 0.000000000000 COMMENT 'Estimated cost (High Precision)',
  `ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `req_body` mediumtext COLLATE utf8mb4_unicode_ci COMMENT 'Request body (Privacy Controlled)',
  `res_body` mediumtext COLLATE utf8mb4_unicode_ci COMMENT 'Response body (Privacy Controlled)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_req_id` (`request_id`),
  KEY `idx_token` (`token_key`),
  KEY `idx_created` (`created_at`),
  KEY `idx_status` (`status_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sys_async_tasks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL,
    user_id INT NOT NULL,
    channel_id INT NOT NULL,
    provider VARCHAR(32) NOT NULL,
    upstream_task_id VARCHAR(128) NOT NULL,
    pre_cost DECIMAL(20, 8) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'PENDING',
    token_key VARCHAR(255) DEFAULT '',
    response_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_req (request_id),
    INDEX idx_upstream (upstream_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- 初始化默认管理员 (密码: 123456)
-- 注意：实际生产环境请修改密码
INSERT INTO `sys_users` (`username`, `password_hash`, `role`, `remark`) VALUES 
('admin', '$2b$10$5/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0', 'admin', '超级管理员');


