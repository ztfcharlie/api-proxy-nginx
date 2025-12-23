package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/go-sql-driver/mysql"
)

type DB struct {
	conn *sql.DB
}

func NewDB(dsn string) (*DB, error) {
	conn, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	
	maxOpen := 100
	if val := os.Getenv("DB_MAX_OPEN_CONNS"); val != "" {
		if v, err := strconv.Atoi(val); err == nil {
			maxOpen = v
		}
	}
	conn.SetMaxOpenConns(maxOpen)
	conn.SetMaxIdleConns(maxOpen / 10) // 10% idle
	conn.SetConnMaxLifetime(3 * time.Minute)

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

// GetAgentPublicKey 获取 Agent 注册的公钥
func (d *DB) GetAgentPublicKey(agentID string) (string, error) {
	var pubKey string
	err := d.conn.QueryRow("SELECT public_key FROM agents WHERE id = ?", agentID).Scan(&pubKey)
	if err != nil {
		return "", err
	}
	return pubKey, nil
}

// RegisterOrValidateAgent 自动注册或验证 Agent, 返回 Tier
func (d *DB) RegisterOrValidateAgent(agentID, pubKey string) (string, error) {
	var existingKey string
	var tier string
	
	err := d.conn.QueryRow("SELECT public_key, tier FROM agents WHERE id = ?", agentID).Scan(&existingKey, &tier)
	
	if err == sql.ErrNoRows {
		// Strict Mode: Do not auto-register unless env says so
		if os.Getenv("ENABLE_TOFU") != "true" {
			return "", fmt.Errorf("agent %s not registered and TOFU is disabled", agentID)
		}
		
		// 新 Agent，自动注册 (TOFU 模式)
		_, err := d.conn.Exec("INSERT INTO agents (id, name, public_key, tier) VALUES (?, 'AutoReg', ?, 'B')", agentID, pubKey)
		if err != nil {
			return "", fmt.Errorf("register failed: %v", err)
		}
		log.Printf("[DB] New agent registered: %s (Tier B)", agentID)
		return "B", nil
	} else if err != nil {
		return "", err
	}

	// 已存在，校验 Key
	if existingKey != pubKey {
		return "", fmt.Errorf("public key mismatch! expected %s..., got %s...", existingKey[:8], pubKey[:8])
	}
	
	return tier, nil
}

func (d *DB) SettleTransaction(reqID string, userID int, agentID string, model string, priceVer string, cost float64, agentIncome float64, agentHash string) error {
	maxRetries := 3
	var err error

	for i := 0; i < maxRetries; i++ {
		err = d.settleTxInternal(reqID, userID, agentID, model, priceVer, cost, agentIncome, agentHash)
		if err == nil {
			return nil
		}

		if mysqlErr, ok := err.(*mysql.MySQLError); ok {
			if mysqlErr.Number == 1213 || mysqlErr.Number == 1205 {
				log.Printf("[DB] Locking error, retrying (%d/%d)...", i+1, maxRetries)
				time.Sleep(100 * time.Millisecond)
				continue
			}
		}
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

	res, err := tx.Exec("UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?", cost, userID, cost)
	if err != nil {
		return fmt.Errorf("deduct failed: %v", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("insufficient balance")
	}

	// 注意：Agent 余额更新已移至 ReconcileAgents (Worker) 或 Redis
	// 这里只负责写入流水

	_, err = tx.Exec(`
		INSERT INTO transactions (req_id, user_id, agent_id, model, price_ver, total_cost, agent_income, agent_hash)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, reqID, userID, agentID, model, priceVer, cost, agentIncome, agentHash)
	if err != nil {
		return fmt.Errorf("log tx failed: %v", err)
	}

	return tx.Commit()
}

// LogAudit 记录审计日志 (Agent & Instances)
func (d *DB) LogAudit(agentID string, eventType string, ip string, instances []struct{ID, Provider string}) {
	// 1. Agent Log
	_, err := d.conn.Exec("INSERT INTO agent_audit_logs (agent_id, event_type, ip) VALUES (?, ?, ?)", 
		agentID, eventType, ip)
	if err != nil {
		log.Printf("[Audit] Failed to log agent: %v", err)
	}

	// 2. Instance Logs (只在 connect/ip_change 时记录快照)
	if eventType == "connect" || eventType == "ip_change" {
		if len(instances) == 0 { return }
		
		// Batch insert to avoid hitting SQL placeholder limits
		batchSize := 500
		for i := 0; i < len(instances); i += batchSize {
			end := i + batchSize
			if end > len(instances) { end = len(instances) }
			
			batch := instances[i:end]
			query := "INSERT INTO instance_audit_logs (instance_id, agent_id, provider, ip) VALUES "
			vals := []interface{}{}
			
			for _, inst := range batch {
				query += "(?, ?, ?, ?),"
				vals = append(vals, inst.ID, agentID, inst.Provider, ip)
			}
			query = query[:len(query)-1] // Remove last comma
			
			_, err = d.conn.Exec(query, vals...)
			if err != nil {
				log.Printf("[Audit] Failed to log instances batch: %v", err)
			}
		}
	}
}