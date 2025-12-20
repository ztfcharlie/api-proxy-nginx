package protocol

import "encoding/json"

// PacketType 定义了消息的类型
type PacketType string

const (
    TypeRegister PacketType = "register"
    TypePing     PacketType = "ping"
    TypePong     PacketType = "pong"
    TypeRequest  PacketType = "request"
    TypeResponse PacketType = "response"
)

// Packet 是 WebSocket 传输的基础数据结构
type Packet struct {
    Type      PacketType      `json:"type"`
    RequestID string          `json:"req_id,omitempty"`
    Payload   json.RawMessage `json:"payload,omitempty"`
}

// HttpRequestPayload 定义了 Hub 发给 Agent 的请求内容
type HttpRequestPayload struct {
    Method  string            `json:"method"`  // GET, POST
    URL     string            `json:"url"`     // 目标 URL (相对路径, 如 /v1/chat/completions)
    Headers map[string]string `json:"headers"` // HTTP Headers
    Body    []byte            `json:"body"`    // HTTP Body (二进制)
}

// HttpResponsePayload 定义了 Agent 发回给 Hub 的响应内容
type HttpResponsePayload struct {
    StatusCode int               `json:"status_code,omitempty"` // 状态码 (仅第一帧需要)
    Headers    map[string]string `json:"headers,omitempty"`     // 响应头 (仅第一帧需要)
    BodyChunk  []byte            `json:"body_chunk"`            // 响应体片段 (流式)
    IsFinal    bool              `json:"is_final"`              // 是否结束
    Error      string            `json:"error,omitempty"`       // 如果出错，填错误信息
}