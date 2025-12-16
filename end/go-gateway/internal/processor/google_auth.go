package processor

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	GoogleTokenURL = "https://oauth2.googleapis.com/token"
	GoogleScope    = "https://www.googleapis.com/auth/cloud-platform"
)

func init() {
	// 优先检查全局 Mock 开关
	if os.Getenv("ENABLE_MOCK_MODE") == "true" {
		// 指向 Node.js 内部 Mock 接口
		// 注意：如果 gateway 运行在容器外，这个地址可能需要调整，但这里保持原样
		GoogleTokenURL = "http://api-proxy-nodejs:8889/mock/oauth2/token"
	} else if url := os.Getenv("GOOGLE_TOKEN_URL"); url != "" {
		GoogleTokenURL = url
	}
}

type ServiceAccountKey struct {
	Type         string `json:"type"`
	ProjectID    string `json:"project_id"`
	PrivateKeyID string `json:"private_key_id"`
	PrivateKey   string `json:"private_key"`
	ClientEmail  string `json:"client_email"`
	ClientID     string `json:"client_id"`
	AuthURI      string `json:"auth_uri"`
	TokenURI     string `json:"token_uri"`
}

type GoogleTokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

func RefreshTokenFromServiceAccount(keyJSON string) (*GoogleTokenResponse, error) {
	var saKey ServiceAccountKey
	if err := json.Unmarshal([]byte(keyJSON), &saKey); err != nil {
		return nil, fmt.Errorf("failed to parse service account json: %v", err)
	}

	block, _ := pem.Decode([]byte(saKey.PrivateKey))
	if block == nil {
		return nil, fmt.Errorf("failed to parse PEM block containing the private key")
	}
	
	var privateKey interface{}
	var err error
	if privateKey, err = x509.ParsePKCS8PrivateKey(block.Bytes); err != nil {
		if privateKey, err = x509.ParsePKCS1PrivateKey(block.Bytes); err != nil {
			return nil, fmt.Errorf("failed to parse private key: %v", err)
		}
	}

	rsaKey, ok := privateKey.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("not an RSA private key")
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"iss": saKey.ClientEmail,
		"scope": GoogleScope,
		"aud": GoogleTokenURL,
		"exp": now.Add(time.Hour).Unix(),
		"iat": now.Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = saKey.PrivateKeyID 

	signedToken, err := token.SignedString(rsaKey)
	if err != nil {
		return nil, fmt.Errorf("failed to sign jwt: %v", err)
	}

	data := url.Values{}
	data.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	data.Set("assertion", signedToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.PostForm(GoogleTokenURL, data)
	if err != nil {
		return nil, fmt.Errorf("failed to send request to google: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("google api error (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp GoogleTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %v", err)
	}

	return &tokenResp, nil
}
