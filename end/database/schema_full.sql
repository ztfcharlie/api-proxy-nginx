-- ==========================================
-- Gemini Proxy 全量数据库结构 (Schema Full)
-- 版本: 3.0
-- 支持: Vertex, Azure, OpenAI, AWS, Anthropic
-- 功能: 多渠道路由、权重负载、模型RPM限制、虚拟令牌管理
-- ==========================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- 1. 系统用户表 (sys_users)
-- ----------------------------
DROP TABLE IF EXISTS `sys_users`;
CREATE TABLE `sys_users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `password_hash` varchar(255) NOT NULL DEFAULT '' COMMENT '密码哈希 (bcrypt)',
  `email` varchar(100) DEFAULT NULL,
  `status` tinyint(4) DEFAULT 1 COMMENT '1:启用, 0:禁用',
  `remark` text COMMENT '备注',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 初始化默认管理员 (密码: 123456)
-- 注意：实际生产环境请修改密码
INSERT INTO `sys_users` (`username`, `password_hash`, `remark`) VALUES 
('admin', '$2b$10$5/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0/0', '超级管理员');


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

SET FOREIGN_KEY_CHECKS = 1;
