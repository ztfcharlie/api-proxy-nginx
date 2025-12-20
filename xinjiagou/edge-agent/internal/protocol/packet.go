package protocol

import "encoding/json"

// PacketType 定义了消息的类型
type PacketType string

const (
    TypeRegister      PacketType = "register"       // Agent -> Hub (我是谁)
    TypeAuthChallenge PacketType = "auth_challenge" // Hub -> Agent (签个名看看)
    TypeAuthResponse  PacketType = "auth_response"  // Agent -> Hub (这是签名)
    
    TypePing     PacketType = "ping"
    TypePong     PacketType = "pong"
    TypeRequest  PacketType = "request"
    TypeResponse PacketType = "response"
)

type Packet struct {
    Type      PacketType      `json:"type"`
    RequestID string          `json:"req_id,omitempty"`
    Payload   json.RawMessage `json:"payload,omitempty"`
}

// === 认证相关 Payload ===

// RegisterPayload 注册包
type RegisterPayload struct {
    Version   string `json:"version"`
    PublicKey string `json:"public_key"` // Hex 格式
}

// AuthChallengePayload 挑战包
type AuthChallengePayload struct {
    Nonce string `json:"nonce"` // 随机字符串
}

// AuthResponsePayload 挑战响应包
type AuthResponsePayload struct {
    Signature string `json:"signature"` // Hex 格式的签名
}

// === 业务相关 Payload ===

type HttpRequestPayload struct {
    Method  string            `json:"method"`
    URL     string            `json:"url"`
    Headers map[string]string `json:"headers"`
    Body    []byte            `json:"body"`
}

type HttpResponsePayload struct {
    StatusCode int               `json:"status_code,omitempty"`
    Headers    map[string]string `json:"headers,omitempty"`
    BodyChunk  []byte            `json:"body_chunk"`
    IsFinal    bool              `json:"is_final"`
    Error      string            `json:"error,omitempty"`
}
