package db

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

type DB struct {
	conn *sql.DB
}

func NewDB(dsn string) (*DB, error) {
	conn, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	
	conn.SetMaxOpenConns(100)
	conn.SetMaxIdleConns(10)
	conn.SetConnMaxLifetime(5 * time.Minute)

	if err := conn.Ping(); err != nil {
		return nil, err
	}
	
	log.Println("[DB] Connected to MySQL")
	return &DB{conn: conn}, nil
}

type User struct {
	ID      int
	Balance float64
}

func (d *DB) GetUserByAPIKey(key string) (*User, error) {
	var u User
	err := d.conn.QueryRow("SELECT id, balance FROM users WHERE api_key = ?", key).Scan(&u.ID, &u.Balance)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// SettleTransaction 结算交易 (增加 agentHash)
func (d *DB) SettleTransaction(reqID string, userID int, agentID string, model string, cost float64, agentIncome float64, agentHash string) error {
	tx, err := d.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec("UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?", cost, userID, cost)
	if err != nil {
		return fmt.Errorf("deduct balance failed: %v", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("insufficient balance")
	}

	_, err = tx.Exec(`
		INSERT INTO agents (id, public_key, balance) VALUES (?, 'mock_key', ?)
		ON DUPLICATE KEY UPDATE balance = balance + ?
	`, agentID, agentIncome, agentIncome)
	if err != nil {
		return fmt.Errorf("pay agent failed: %v", err)
	}

	// 记录 agent_hash
	_, err = tx.Exec(`
		INSERT INTO transactions (req_id, user_id, agent_id, model, price_ver, total_cost, agent_income, agent_hash)
		VALUES (?, ?, ?, ?, 'v1', ?, ?, ?)
	`, reqID, userID, agentID, model, cost, agentIncome, agentHash)
	if err != nil {
		return fmt.Errorf("log tx failed: %v", err)
	}

	return tx.Commit()
}