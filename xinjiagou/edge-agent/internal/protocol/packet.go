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
)

type Packet struct {
    Type      PacketType      `json:"type"`
    RequestID string          `json:"req_id,omitempty"`
    Payload   json.RawMessage `json:"payload,omitempty"`
}

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
    Method       string            `json:"method,omitempty"`
    URL          string            `json:"url,omitempty"`
    Headers      map[string]string `json:"headers,omitempty"`
    PriceVersion string            `json:"price_ver,omitempty"`
    
    BodyChunk    []byte            `json:"body_chunk,omitempty"`
    IsFinal      bool              `json:"is_final"`
}

type HttpResponsePayload struct {
    StatusCode int               `json:"status_code,omitempty"`
    Headers    map[string]string `json:"headers,omitempty"`
    BodyChunk  []byte            `json:"body_chunk"`
    IsFinal    bool              `json:"is_final"`
    Error      string            `json:"error,omitempty"`
    Usage      *Usage            `json:"usage,omitempty"`
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
