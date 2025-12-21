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

	// 尝试添加 agent_hash 列
	// 如果列已存在，MySQL 会报错 Duplicate column name，我们忽略它即可
	_, err = db.Exec("ALTER TABLE transactions ADD COLUMN agent_hash VARCHAR(64) DEFAULT ''")
	if err != nil {
		log.Printf("Migration notice (might be already up to date): %v", err)
	} else {
		log.Println("✅ Successfully added 'agent_hash' column to transactions table.")
	}

	log.Println("Database migration completed.")
}
