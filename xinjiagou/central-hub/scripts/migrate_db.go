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
