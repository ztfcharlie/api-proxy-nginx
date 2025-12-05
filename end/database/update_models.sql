CREATE TABLE IF NOT EXISTS `sys_models` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `provider` varchar(50) NOT NULL COMMENT '厂商: openai, google, anthropic, qwen, deepseek',
  `name` varchar(100) NOT NULL COMMENT '模型名称',
  `price_input` decimal(12,6) DEFAULT 0.000000 COMMENT '百万Token输入价格',
  `price_output` decimal(12,6) DEFAULT 0.000000 COMMENT '百万Token输出价格',
  `price_cache` decimal(12,6) DEFAULT 0.000000 COMMENT '百万Token缓存价格',
  `price_time` decimal(12,6) DEFAULT 0.000000 COMMENT '每秒价格',
  `price_request` decimal(12,6) DEFAULT 0.000000 COMMENT '每次请求价格',
  `status` tinyint(4) DEFAULT 1 COMMENT '1:启用, 0:禁用',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider_name` (`provider`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
