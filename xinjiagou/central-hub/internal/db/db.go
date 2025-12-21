package db

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/go-sql-driver/mysql" // 需要引用 driver 结构体来判断错误码
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

// SettleTransaction 结算交易 (修复写死版本号 + 增加重试)
func (d *DB) SettleTransaction(reqID string, userID int, agentID string, model string, priceVer string, cost float64, agentIncome float64, agentHash string) error {
	maxRetries := 3
	var err error

	for i := 0; i < maxRetries; i++ {
		err = d.settleTxInternal(reqID, userID, agentID, model, priceVer, cost, agentIncome, agentHash)
		if err == nil {
			return nil // 成功
		}

		// 检查是否为死锁或锁超时错误
		if mysqlErr, ok := err.(*mysql.MySQLError); ok {
			if mysqlErr.Number == 1213 || mysqlErr.Number == 1205 { // 1213=Deadlock, 1205=LockWait
				log.Printf("[DB] Locking error, retrying (%d/%d)...", i+1, maxRetries)
				time.Sleep(100 * time.Millisecond) // 稍等再试
				continue
			}
		}
		
		// 其他错误直接返回
		return err
	}
	
	return fmt.Errorf("settle failed after retries: %v", err)
}

func (d *DB) settleTxInternal(reqID string, userID int, agentID string, model string, priceVer string, cost float64, agentIncome float64, agentHash string) error {
	tx, err := d.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. 扣用户钱
	res, err := tx.Exec("UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?", cost, userID, cost)
	if err != nil {
		return fmt.Errorf("deduct failed: %v", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("insufficient balance")
	}

	// 2. 加 Agent 钱
	_, err = tx.Exec(`
		INSERT INTO agents (id, public_key, balance) VALUES (?, 'mock_key', ?)
		ON DUPLICATE KEY UPDATE balance = balance + ?
	`, agentID, agentIncome, agentIncome)
	if err != nil {
		return fmt.Errorf("pay agent failed: %v", err)
	}

	// 3. 记流水 (修复: 使用传入的 priceVer)
	_, err = tx.Exec(`
		INSERT INTO transactions (req_id, user_id, agent_id, model, price_ver, total_cost, agent_income, agent_hash)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, reqID, userID, agentID, model, priceVer, cost, agentIncome, agentHash)
	if err != nil {
		return fmt.Errorf("log tx failed: %v", err)
	}

	return tx.Commit()
}
