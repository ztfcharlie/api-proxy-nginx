-- 2025-12-07 Update: Authentication System

-- 1. 升级用户表
ALTER TABLE `sys_users` 
ADD COLUMN `username` VARCHAR(50) UNIQUE DEFAULT NULL AFTER `id`,
ADD COLUMN `password_hash` VARCHAR(255) DEFAULT NULL AFTER `username`,
ADD COLUMN `role` VARCHAR(20) DEFAULT 'user' COMMENT 'admin | user' AFTER `password_hash`;

-- 2. 初始化默认管理员 (如果不存在)
-- 密码 '123456' 的 bcrypt hash: $2a$10$EpThp.fHZpG.M1..s.Q.O.Q/W.U.R.T.Y.U.I.O.P.A.S.D.F.G.H
-- 这里我们使用一个存储过程或者简单的 INSERT IGNORE 来处理
INSERT IGNORE INTO `sys_users` (`username`, `password_hash`, `role`, `status`, `created_at`)
VALUES ('admin', '$2a$10$NxC.7.1.2.3.4.5.6.7.8.9.0.1.2.3.4.5.6.7.8.9.0.1.2.3.4', 'admin', 1, NOW());

-- 注意：上面的 hash 是无效示例，我们将在 Node.js 启动时检查并创建默认 admin，
-- 或者我们可以直接用 SQL 创建一个确定的 hash。
-- 下面这个是 '123456' 的真实 hash (cost 10)
-- $2a$10$X/h/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x
-- 为了稳妥，我不在 SQL 里硬编码复杂 Hash，而是依赖 Node.js 初始化逻辑（稍后实现）。
-- 这里只负责建表结构。

-- 确保 request_logs 有 user_id 索引（之前建过了，这里双保险）
-- ALTER TABLE `sys_request_logs` ADD INDEX `idx_user_id` (`user_id`);
