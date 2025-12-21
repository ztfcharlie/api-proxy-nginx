CREATE DATABASE IF NOT EXISTS xinjiagou;
USE xinjiagou;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    api_key VARCHAR(64) NOT NULL UNIQUE,
    balance DECIMAL(18, 6) DEFAULT 0.000000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agents (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(50),
    public_key TEXT NOT NULL,
    balance DECIMAL(18, 6) DEFAULT 0.000000,
    tier_ratio DECIMAL(3, 2) DEFAULT 0.80,
    status TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_tables (
    version VARCHAR(20) PRIMARY KEY,
    content JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    req_id VARCHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    agent_id VARCHAR(64) NOT NULL,
    model VARCHAR(50) NOT NULL,
    
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    
    price_ver VARCHAR(20) NOT NULL,
    total_cost DECIMAL(18, 6) NOT NULL,
    agent_income DECIMAL(18, 6) NOT NULL,
    
    -- 新增: Agent 上报的防篡改 Hash
    agent_hash VARCHAR(64) DEFAULT '',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_agent (agent_id)
);

-- Init Data
INSERT IGNORE INTO users (username, api_key, balance) VALUES ('test_user', 'sk-test-123', 10.00);
INSERT IGNORE INTO price_tables (version, content) VALUES ('v1.0.0', '{"models": {"gpt-4": {"input": 30.0, "output": 60.0}, "gpt-3.5-turbo": {"input": 0.5, "output": 1.5}}}');