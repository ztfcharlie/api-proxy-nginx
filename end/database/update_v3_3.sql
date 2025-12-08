-- Update provider column length to support JSON array
ALTER TABLE `sys_models` MODIFY COLUMN `provider` VARCHAR(512) NOT NULL COMMENT '厂商列表(JSON)';

-- Add default_rpm column if not exists
ALTER TABLE `sys_models` ADD COLUMN `default_rpm` INT DEFAULT 1000 COMMENT '默认RPM限制';
