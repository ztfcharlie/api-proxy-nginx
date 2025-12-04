-- 1. 用户表
CREATE TABLE IF NOT EXISTS sys_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100),
    status TINYINT DEFAULT 1, -- 1:启用, 0:禁用
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 真实渠道表 (供应商)
-- 存储真实的 API Key 或 Service Account JSON
CREATE TABLE IF NOT EXISTS sys_channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'vertex', 'openai', 'azure', 'claude'
    
    -- 凭证信息
    credentials JSON,          -- 存储 Service Account JSON 内容 或 { "api_key": "sk-..." }
    base_url VARCHAR(255),     -- 真实的 API 地址
    
    -- 状态维护
    status TINYINT DEFAULT 1,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 虚拟凭证表 (Virtual Keys)
-- 发给客户端的 Key。如果是 Vertex，这里存储生成的“假”JSON 的核心参数
CREATE TABLE IF NOT EXISTS sys_virtual_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100),
    type VARCHAR(20) NOT NULL, -- 'vertex', 'openai'
    
    -- 虚拟凭证核心数据
    access_key VARCHAR(255) UNIQUE, -- 对于 OpenAI 是 sk-mock-xxx，对于 Vertex 是 client_email
    secret_key TEXT,                -- 对于 Vertex 是生成的 RSA 私钥 (PEM格式)
    public_key TEXT,                -- 对于 Vertex 是生成的 RSA 公钥 (PEM格式)
    
    -- 配置
    qps_limit INT DEFAULT 10,
    status TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES sys_users(id)
);

-- 4. 路由规则表 (绑定关系)
-- 决定一个 Virtual Key 可以使用哪些 Channel，以及权重
CREATE TABLE IF NOT EXISTS sys_route_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    virtual_key_id INT NOT NULL,
    channel_id INT NOT NULL,
    
    weight INT DEFAULT 100,      -- 权重
    model_whitelist JSON,        -- 允许使用的模型列表 ["gemini-pro", "gpt-4"]
    
    FOREIGN KEY (virtual_key_id) REFERENCES sys_virtual_keys(id),
    FOREIGN KEY (channel_id) REFERENCES sys_channels(id)
);
