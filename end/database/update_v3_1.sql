-- 尝试添加字段，如果已存在则会报错（可忽略）
ALTER TABLE sys_virtual_tokens ADD COLUMN expires_at TIMESTAMP NULL DEFAULT NULL;