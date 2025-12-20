package crypto

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"encoding/pem"
	"os"
	"log"
)

// KeyPair 包含公钥和私钥
type KeyPair struct {
	PrivateKey ed25519.PrivateKey
	PublicKey  ed25519.PublicKey
}

// LoadOrGenerateKeys 尝试从文件加载密钥，如果没有则生成新的
func LoadOrGenerateKeys(keyFile string) (*KeyPair, error) {
	// 1. 尝试读取文件
	if _, err := os.Stat(keyFile); os.IsNotExist(err) {
		log.Printf("[Crypto] Key file not found, generating new keys...")
		return generateAndSaveKeys(keyFile)
	}

	// 2. 读取现有密钥
	keyData, err := os.ReadFile(keyFile)
	if err != nil {
		return nil, err
	}

	// 3. 解析 PEM
	block, _ := pem.Decode(keyData)
	if block == nil || block.Type != "PRIVATE KEY" {
		log.Printf("[Crypto] Invalid key file format, regenerating...")
		return generateAndSaveKeys(keyFile)
	}

	// 4. 还原私钥 (Ed25519 私钥是 64 字节: 32字节种子 + 32字节公钥)
	if len(block.Bytes) != ed25519.PrivateKeySize {
		return nil, os.ErrInvalid
	}
	privKey := ed25519.PrivateKey(block.Bytes)
	pubKey := privKey.Public().(ed25519.PublicKey)

	return &KeyPair{
		PrivateKey: privKey,
		PublicKey:  pubKey,
	}, nil
}

func generateAndSaveKeys(filename string) (*KeyPair, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}

	// 保存私钥到文件 (PEM 格式)
	file, err := os.Create(filename)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	pem.Encode(file, &pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: priv,
	})

	log.Printf("[Crypto] New key pair generated. Public Key: %s", hex.EncodeToString(pub))
	
	return &KeyPair{
		PrivateKey: priv,
		PublicKey:  pub,
	}, nil
}

// Sign 对数据进行签名
func (k *KeyPair) Sign(data []byte) []byte {
	return ed25519.Sign(k.PrivateKey, data)
}

// GetPublicKeyHex 返回 Hex 格式的公钥 (用于复制到 Hub)
func (k *KeyPair) GetPublicKeyHex() string {
	return hex.EncodeToString(k.PublicKey)
}
