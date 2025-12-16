package handler

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"database/sql"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"strings"
	"time"

	"api-proxy/go-gateway/pkg/redis"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type OAuth2Handler struct {
	db *sql.DB
}

func NewOAuth2Handler(db *sql.DB) *OAuth2Handler {
	return &OAuth2Handler{db: db}
}

// TokenEndpoint 处理 /oauth2.googleapis.com/token
func (h *OAuth2Handler) TokenEndpoint(c *gin.Context) {
	// 1. 解析 Form Data
	grantType := c.PostForm("grant_type")
	assertion := c.PostForm("assertion")

	if grantType != "urn:ietf:params:oauth:grant-type:jwt-bearer" {
		c.JSON(400, gin.H{"error": "invalid_grant", "error_description": "Invalid grant_type"})
		return
	}
	if assertion == "" {
		c.JSON(400, gin.H{"error": "invalid_request", "error_description": "Missing assertion"})
		return
	}

	// 2. 解析 JWT 获取 iss (不验证签名)
	parser := jwt.NewParser()
	token, _, err := parser.ParseUnverified(assertion, jwt.MapClaims{})
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid_grant", "error_description": "Invalid JWT format"})
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(400, gin.H{"error": "invalid_grant", "error_description": "Invalid JWT claims"})
		return
	}

	iss, ok := claims["iss"].(string)
	if !ok || iss == "" {
		c.JSON(400, gin.H{"error": "invalid_grant", "error_description": "Missing iss claim"})
		return
	}

	// 3. 查数据库获取公钥
	var vID, userID int
	var publicKeyPEM string
	err = h.db.QueryRowContext(c.Request.Context(), "SELECT id, user_id, public_key FROM sys_virtual_tokens WHERE token_key = ? AND status = 1", iss).Scan(&vID, &userID, &publicKeyPEM)
	
	if err == sql.ErrNoRows {
		c.JSON(401, gin.H{"error": "invalid_client", "error_description": "Unknown or disabled service account"})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": "server_error", "error_description": "Database error"})
		return
	}

	// 4. 验证签名
	block, _ := pem.Decode([]byte(publicKeyPEM))
	if block == nil {
		c.JSON(500, gin.H{"error": "server_error", "error_description": "Invalid stored public key"})
		return
	}
	
	pubKey, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		c.JSON(500, gin.H{"error": "server_error", "error_description": "Failed to parse public key"})
		return
	}

	rsaKey, ok := pubKey.(*rsa.PublicKey)
	if !ok {
		c.JSON(500, gin.H{"error": "server_error", "error_description": "Key is not RSA"})
		return
	}

	// 重新解析并验证
	validToken, err := parser.Parse(assertion, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return rsaKey, nil
	})

	if err != nil || !validToken.Valid {
		c.JSON(401, gin.H{"error": "invalid_grant", "error_description": "Invalid signature"})
		return
	}

	// 5. 签发 Virtual Access Token
	accessToken := fmt.Sprintf("yo39.virtual.%s", strings.ReplaceAll(uuid.New().String(), "-", ""))
	expiresIn := 3600 // 1 hour

	// 6. 存入 Redis
	// 结构: oauth2:vtoken:<token> -> JSON
	// 这里存 ChannelID=0，表示尚未选定渠道，由 AuthMiddleware 根据路由规则选择
	tokenData := map[string]interface{}{
		"user_id":    userID,
		"channel_id": 0, // Dynamic routing
		"vtoken_id":  vID, // 记录来源虚拟Token ID
	}
	val, _ := json.Marshal(tokenData)
	
	err = redis.Client.Set(context.Background(), "oauth2:vtoken:"+accessToken, string(val), time.Duration(expiresIn)*time.Second).Err()
	if err != nil {
		c.JSON(500, gin.H{"error": "server_error", "error_description": "Redis write failed"})
		return
	}

	// 7. 返回响应
	c.JSON(200, gin.H{
		"access_token": accessToken,
		"expires_in":   expiresIn,
		"token_type":   "Bearer",
	})
}
