package main

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	GoogleTokenURL = "https://oauth2.googleapis.com/token"
	GoogleScope    = "https://www.googleapis.com/auth/cloud-platform"
)

// ServiceAccountKey 定义 GCP 服务账号 JSON 结构
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

// GoogleTokenResponse 定义 Google API 返回的 Token 结构
type GoogleTokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

// RefreshTokenFromServiceAccount 使用服务账号 JSON 刷新 Token
func RefreshTokenFromServiceAccount(keyJSON string) (*GoogleTokenResponse, error) {
	var saKey ServiceAccountKey
	if err := json.Unmarshal([]byte(keyJSON), &saKey); err != nil {
		return nil, fmt.Errorf("failed to parse service account json: %v", err)
	}

	// 1. 解析私钥
	block, _ := pem.Decode([]byte(saKey.PrivateKey))
	if block == nil {
		return nil, fmt.Errorf("failed to parse PEM block containing the private key")
	}
	
	// 尝试解析 PKCS8 或 PKCS1
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

	// 2. 生成 JWT
	now := time.Now()
	claims := jwt.MapClaims{
		"iss": saKey.ClientEmail,
		"scope": GoogleScope,
		"aud": GoogleTokenURL,
		"exp": now.Add(time.Hour).Unix(),
		"iat": now.Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = saKey.PrivateKeyID // 可选，有些 API 需要

	signedToken, err := token.SignedString(rsaKey)
	if err != nil {
		return nil, fmt.Errorf("failed to sign jwt: %v", err)
	}

	// 3. 发送请求换取 Access Token
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

// RefreshTokenFromRefreshToken (预留) 针对 User 类型的刷新
func RefreshTokenFromRefreshToken(clientID, clientSecret, refreshToken string) (*GoogleTokenResponse, error) {
	// TODO: 实现 User OAuth flow
	// 目前 Node.js 版本似乎主要用 Service Account，这里先留空
	return nil, fmt.Errorf("not implemented")
}
