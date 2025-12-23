package keystore

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"io"
	"os"
	"sync"

	"golang.org/x/crypto/pbkdf2"
)

type Store struct {
	mu      sync.RWMutex
	secrets map[string]string // ID -> Real Key/JSON
}

var GlobalStore *Store

func init() {
	GlobalStore = &Store{
		secrets: make(map[string]string),
	}
}

// deriveKey 生成 AES 密钥 (PBKDF2)
func deriveKey(password string, salt []byte) []byte {
	return pbkdf2.Key([]byte(password), salt, 4096, 32, sha256.New)
}

func (s *Store) Load(filepath string, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(filepath)
	if os.IsNotExist(err) {
		return nil // 新文件
	}
	if err != nil {
		return err
	}

	if len(data) < 12+32 { // Nonce(12) + Salt(32)
		return errors.New("invalid keystore file format")
	}

	salt := data[:32]
	nonce := data[32 : 32+12]
	ciphertext := data[32+12:]

	key := deriveKey(password, salt)
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}

	plaintext, err := aesgcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return errors.New("decryption failed: wrong password or corrupted file")
	}

	return json.Unmarshal(plaintext, &s.secrets)
}

func (s *Store) Save(filepath string, password string) error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	plaintext, err := json.Marshal(s.secrets)
	if err != nil {
		return err
	}

	salt := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return err
	}

	key := deriveKey(password, salt)
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}

	nonce := make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return err
	}

	ciphertext := aesgcm.Seal(nil, nonce, plaintext, nil)

	// File format: Salt(32) + Nonce(12) + Ciphertext(...)
	finalData := append(salt, nonce...)
	finalData = append(finalData, ciphertext...)

	// Atomic Write: Write to tmp file then rename
	tmpPath := filepath + ".tmp"
	if err := os.WriteFile(tmpPath, finalData, 0600); err != nil {
		return err
	}
	
	// Rename is atomic on POSIX, usually safe enough on Windows
	return os.Rename(tmpPath, filepath)
}

func (s *Store) Get(id string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	val, ok := s.secrets[id]
	return val, ok
}

func (s *Store) Set(id string, secret string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.secrets[id] = secret
}
