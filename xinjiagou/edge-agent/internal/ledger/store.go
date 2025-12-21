package ledger

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
	mu sync.Mutex
}

func NewStore(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}

	query := `
	CREATE TABLE IF NOT EXISTS transactions (
		req_id TEXT PRIMARY KEY,
		timestamp INTEGER,
		prompt_tokens INTEGER,
		completion_tokens INTEGER,
		prev_hash TEXT NOT NULL,
		hash TEXT NOT NULL
	);
	`
	if _, err := db.Exec(query); err != nil {
		return nil, err
	}

	log.Println("[Ledger] SQLite initialized with Hash Chain support")
	return &Store{db: db}, nil
}

// RecordTransaction 记录交易并返回生成的 Hash
func (s *Store) RecordTransaction(reqID string, promptTokens, completionTokens int) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	ts := time.Now().Unix()

	var prevHash string
	err := s.db.QueryRow("SELECT hash FROM transactions ORDER BY rowid DESC LIMIT 1").Scan(&prevHash)
	
	if err == sql.ErrNoRows {
		prevHash = "0000000000000000000000000000000000000000000000000000000000000000"
	} else if err != nil {
		return "", fmt.Errorf("failed to get prev hash: %v", err)
	}

	payload := fmt.Sprintf("%s|%s|%d|%d|%d", prevHash, reqID, ts, promptTokens, completionTokens)
	hashBytes := sha256.Sum256([]byte(payload))
	currentHash := hex.EncodeToString(hashBytes[:])

	_, err = s.db.Exec(`
		INSERT INTO transactions (req_id, timestamp, prompt_tokens, completion_tokens, prev_hash, hash)
		VALUES (?, ?, ?, ?, ?, ?)
	`, reqID, ts, promptTokens, completionTokens, prevHash, currentHash)

	if err != nil {
		return "", fmt.Errorf("ledger write failed: %v", err)
	}

	return currentHash, nil
}
