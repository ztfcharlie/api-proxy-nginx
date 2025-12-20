package tunnel

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"errors"
)

// generateNonce 生成 32 字节的随机挑战码
func generateNonce() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// verifySignature 验证 Ed25519 签名
func verifySignature(pubKeyHex string, nonce string, signatureHex string) error {
	// 1. 解析公钥
	pubBytes, err := hex.DecodeString(pubKeyHex)
	if err != nil || len(pubBytes) != ed25519.PublicKeySize {
		return errors.New("invalid public key format")
	}

	// 2. 解析签名
	sigBytes, err := hex.DecodeString(signatureHex)
	if err != nil || len(sigBytes) != ed25519.SignatureSize {
		return errors.New("invalid signature format")
	}

	// 3. 验证
	if !ed25519.Verify(pubBytes, []byte(nonce), sigBytes) {
		return errors.New("signature verification failed")
	}

	return nil
}
