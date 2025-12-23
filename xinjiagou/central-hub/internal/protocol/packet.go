package protocol

import "encoding/json"

type PacketType string

const (
    TypeRegister      PacketType = "register"
    TypeAuthChallenge PacketType = "auth_challenge"
    TypeAuthResponse  PacketType = "auth_response"
    TypePing          PacketType = "ping"
    TypePong          PacketType = "pong"
    TypeRequest       PacketType = "request"
    TypeResponse      PacketType = "response"
    TypePriceUpdate   PacketType = "price_update"
    TypeModelUpdate   PacketType = "model_update" // 新增: Agent 主动上报模型变更
    TypeProbe         PacketType = "probe" // Hub 主动探测 IP
    TypeAbort         PacketType = "abort" // Hub 通知 Agent 取消请求
)

type Packet struct {
    Type      PacketType      `json:"type"`
    RequestID string          `json:"req_id,omitempty"`
    Payload   json.RawMessage `json:"payload,omitempty"`
}

// InstanceConfig 描述一个具体的账号实例 (不含Key)
type InstanceConfig struct {
    ID       string   `json:"id"`       // Agent本地唯一标识 (e.g. "acc-1")
    Provider string   `json:"provider"` // "openai", "anthropic"
    Models   []string `json:"models"`   // 支持的模型列表
    Tier     string   `json:"tier"`     // 账号等级: "T0", "T1"
    RPM      int      `json:"rpm"`      // 自定义的RPM限制
    Tags     []string `json:"tags"`     // e.g. ["vertex", "us-east"]
}

type RegisterPayload struct {
    Version   string           `json:"version"`
    PublicKey string           `json:"public_key"`
    Instances []InstanceConfig `json:"instances"` // 列表形式上报
}

type ModelUpdatePayload struct {
    Instances []InstanceConfig `json:"instances"`
}

type ProbePayload struct {
    URL string `json:"url"` // Hub 的回响接口地址
}

type AuthChallengePayload struct {
    Nonce string `json:"nonce"`
}
type AuthResponsePayload struct {
    Signature string `json:"signature"`
}

type Usage struct {
    PromptTokens     int    `json:"prompt_tokens,omitempty"`
    CompletionTokens int    `json:"completion_tokens,omitempty"`
    ImageCount       int    `json:"image_count,omitempty"`
    ImageResolution  string `json:"image_resolution,omitempty"`
    AudioSeconds     int    `json:"audio_seconds,omitempty"`
    VideoSeconds     int    `json:"video_seconds,omitempty"`
    VideoResolution  string `json:"video_resolution,omitempty"`
}

type HttpRequestPayload struct {
    Method           string            `json:"method,omitempty"`
    URL              string            `json:"url,omitempty"`
    Headers          map[string]string `json:"headers,omitempty"`
    PriceVersion     string            `json:"price_ver,omitempty"`
    BodyChunk        []byte            `json:"body_chunk,omitempty"`
    IsFinal          bool              `json:"is_final"`
    TargetInstanceID string            `json:"target_instance_id,omitempty"`
    TargetProvider   string            `json:"target_provider,omitempty"` // 新增: 明确厂商
}

type HttpResponsePayload struct {
    StatusCode int               `json:"status_code,omitempty"`
    Headers    map[string]string `json:"headers,omitempty"`
    BodyChunk  []byte            `json:"body_chunk"`
    IsFinal    bool              `json:"is_final"`
    Error      string            `json:"error,omitempty"`
    ErrorType  string            `json:"error_type,omitempty"`
    RetryAfter int               `json:"retry_after,omitempty"`
    InstanceID string            `json:"instance_id,omitempty"` // 反馈源
    Usage      *Usage            `json:"usage,omitempty"`
    
    // 新增: Agent 的记账 Hash
    AgentHash  string            `json:"agent_hash,omitempty"`
}

type PriceTable struct {
    Version string             `json:"version"`
    Models  map[string]ModelPrice `json:"models"`
}

type ModelPrice struct {
    InputPrice  float64 `json:"input"`
    OutputPrice float64 `json:"output"`
    PerRequest  float64 `json:"per_req"`
}