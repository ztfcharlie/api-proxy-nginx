-- 2025-12-07 Update: Add Request Logs Table (Enhanced)

CREATE TABLE IF NOT EXISTS `sys_request_logs` (
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