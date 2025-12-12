ALTER TABLE sys_models ADD COLUMN is_async TINYINT DEFAULT 0;

CREATE TABLE IF NOT EXISTS sys_async_tasks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL,
    user_id INT NOT NULL,
    channel_id INT NOT NULL,
    provider VARCHAR(32) NOT NULL,
    upstream_task_id VARCHAR(128) NOT NULL,
    pre_cost DECIMAL(20, 8) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'PENDING',
    response_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_req (request_id),
    INDEX idx_upstream (upstream_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
