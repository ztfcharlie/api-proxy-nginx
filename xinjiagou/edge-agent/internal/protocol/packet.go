package protocol

import "encoding/json"

// PacketType 定义消息类型
type PacketType string

const (
    TypeRegister      PacketType = "register"
    TypeAuthChallenge PacketType = "auth_challenge"
    TypeAuthResponse  PacketType = "auth_response"
    
    TypePing          PacketType = "ping"
    TypePong          PacketType = "pong"
    
    TypeRequest       PacketType = "request"
    TypeResponse      PacketType = "response"
    
    // 新增: 价格更新广播
    TypePriceUpdate   PacketType = "price_update"
)

type Packet struct {
    Type      PacketType      `json:"type"`
    RequestID string          `json:"req_id,omitempty"`
    Payload   json.RawMessage `json:"payload,omitempty"`
}

// === 认证相关 ===
type RegisterPayload struct {
    Version   string `json:"version"`
    PublicKey string `json:"public_key"`
}
type AuthChallengePayload struct {
    Nonce string `json:"nonce"`
}
type AuthResponsePayload struct {
    Signature string `json:"signature"`
}

// === 业务相关 ===

// Usage 定义所有可能的计费维度
type Usage struct {
    PromptTokens     int    `json:"prompt_tokens,omitempty"`     // 文本输入
    CompletionTokens int    `json:"completion_tokens,omitempty"` // 文本输出
    
    ImageCount       int    `json:"image_count,omitempty"`       // 图片张数
    ImageResolution  string `json:"image_resolution,omitempty"`  // 图片分辨率
    
    AudioSeconds     int    `json:"audio_seconds,omitempty"`     // 音频时长
    
    VideoSeconds     int    `json:"video_seconds,omitempty"`     // 视频时长
    VideoResolution  string `json:"video_resolution,omitempty"`  // 视频分辨率
}

type HttpRequestPayload struct {
    Method       string            `json:"method"`
    URL          string            `json:"url"`
    Headers      map[string]string `json:"headers"`
    Body         []byte            `json:"body"`
    
    // 新增: 计费版本号
    PriceVersion string            `json:"price_ver"`
}

type HttpResponsePayload struct {
    StatusCode int               `json:"status_code,omitempty"`
    Headers    map[string]string `json:"headers,omitempty"`
    BodyChunk  []byte            `json:"body_chunk"`
    IsFinal    bool              `json:"is_final"`
    Error      string            `json:"error,omitempty"`
    
    // 新增: 只有在 IsFinal=true 时才会有 Usage
    Usage        *Usage            `json:"usage,omitempty"`
}

// PriceTable 定义价格表结构
type PriceTable struct {
    Version string             `json:"version"`
    Models  map[string]ModelPrice `json:"models"`
}

type ModelPrice struct {
    InputPrice  float64 `json:"input"`  // 每 1M Token 的价格 (USD)
    OutputPrice float64 `json:"output"`
    PerRequest  float64 `json:"per_req"` // 每次请求固定价格 (用于图片/视频)
}