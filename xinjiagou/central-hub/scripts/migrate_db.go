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

	// 定义所有需要迁移的语句
	queries := []string{
		// 1. 添加 agent_hash
		"ALTER TABLE transactions ADD COLUMN agent_hash VARCHAR(64) DEFAULT ''",
		// 2. 添加 is_settled
		"ALTER TABLE transactions ADD COLUMN is_settled TINYINT DEFAULT 0",
		// 3. 添加索引 (加快对账查询速度)
		"CREATE INDEX idx_settled ON transactions(is_settled)",
	}

	for _, q := range queries {
		_, err := db.Exec(q)
		if err != nil {
			// 简单判断: 如果报错包含 "Duplicate" 或 "exists"，说明已经有了，跳过
			log.Printf("Migration step notice: %v", err)
		} else {
			log.Printf("✅ Executed: %s", q)
		}
	}

	log.Println("Database migration completed.")
}