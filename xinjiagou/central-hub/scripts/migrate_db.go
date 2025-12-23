package main

import (
	"database/sql"
	"log"
	"os"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	dsn := "root:123456@tcp(127.0.0.1:3306)/xinjiagou"
	if envDSN := os.Getenv("DB_DSN"); envDSN != "" {
		dsn = envDSN
	}

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("DB unreachable: %v", err)
	}

	log.Println("Checking database schema...")

	queries := []string{
		"ALTER TABLE transactions ADD COLUMN agent_hash VARCHAR(64) DEFAULT ''",
		"ALTER TABLE transactions ADD COLUMN is_settled TINYINT DEFAULT 0",
		"CREATE INDEX idx_settled ON transactions(is_settled)",
		"ALTER TABLE agents ADD COLUMN tier CHAR(1) DEFAULT 'B'", // 新增: Agent 等级
		
		// 新增: 创建提现表 (如果不存在)
		`CREATE TABLE IF NOT EXISTS withdrawals (
			id VARCHAR(64) PRIMARY KEY,
			agent_id VARCHAR(64) NOT NULL,
			amount DECIMAL(18, 6) NOT NULL,
			status TINYINT DEFAULT 0 COMMENT '0=Pending, 1=Paid, 2=Rejected',
			tx_hash VARCHAR(128) COMMENT 'Payment gateway transaction id',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			processed_at TIMESTAMP NULL,
			INDEX idx_agent (agent_id)
		)`,
		"INSERT IGNORE INTO users (username, api_key, balance) VALUES ('ant_user', 'sk-ant-test-key-123', 10.00)",
		"INSERT IGNORE INTO users (username, api_key, balance) VALUES ('goog_user', 'sk-goog-test-key-123', 10.00)",
		"INSERT IGNORE INTO users (username, api_key, balance) VALUES ('aws_user', 'sk-aws-test-key-123', 10.00)",
		"INSERT IGNORE INTO users (username, api_key, balance) VALUES ('azure_user', 'sk-azure-test-key-123', 10.00)",
		
		// 审计日志: Agent 物理IP
		`CREATE TABLE IF NOT EXISTS agent_audit_logs (
			id INT AUTO_INCREMENT PRIMARY KEY,
			agent_id VARCHAR(64) NOT NULL,
			event_type VARCHAR(32) NOT NULL, -- 'connect', 'ip_change', 'probe'
			ip VARCHAR(45) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_agent (agent_id),
			INDEX idx_created (created_at)
		)`,

		// 审计日志: Instance 归属与环境快照 (冗余存储，便于快速溯源)
		`CREATE TABLE IF NOT EXISTS instance_audit_logs (
			id INT AUTO_INCREMENT PRIMARY KEY,
			instance_id VARCHAR(64) NOT NULL,
			agent_id VARCHAR(64) NOT NULL,
			provider VARCHAR(32) NOT NULL,
			ip VARCHAR(45) NOT NULL, -- 继承自 Agent IP
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_instance (instance_id),
			INDEX idx_agent_inst (agent_id, instance_id)
		)`,
		
		"ALTER TABLE agents ADD COLUMN last_hash VARCHAR(64) DEFAULT ''", // 账本校验
	}

	for _, q := range queries {
		_, err := db.Exec(q)
		if err != nil {
			log.Printf("Migration step notice: %v", err)
		} else {
			log.Printf("✅ Executed: %s", q)
		}
	}

	log.Println("Database migration completed.")
}
