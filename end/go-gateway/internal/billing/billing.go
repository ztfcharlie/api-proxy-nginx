package billing

import (
	"context"
)

// UsageMetrics 统一计费指标 (量)
// 包含所有模态的计费维度
type UsageMetrics struct {
	// 文本
	InputTokens      int
	OutputTokens     int
	TotalTokens      int
	CacheReadTokens  int // DeepSeek/Anthropic Cache
	CacheWriteTokens int

	// 图片
	ImageCount   int
	ImageSize    string // "1024x1024"
	ImageQuality string // "hd", "standard"

	// 视频
	VideoSeconds    float64
	VideoResolution string // "720p", "1080p"
	VideoQuality    string // "high_quality"

	// 音频
	AudioSeconds float64
	
	// 通用
	RequestCount int // 某些接口按次计费
}

// Strategy 计费策略接口
// 每个厂商实现一个 Strategy
type Strategy interface {
	// Name 策略名称，如 "openai", "claude", "luma"
	Name() string

	// Calculate 解析请求和响应，提取 UsageMetrics
	// ctx: 上下文
	// model: 模型名称 (gpt-4, svd-xt)
	// reqBody: 请求体 (可能部分读取)
	// resBody: 响应体 (可能是完整的，也可能是流式片段)
	// isStream: 是否流式
	// statusCode: HTTP 状态码
	Calculate(ctx context.Context, model string, reqBody []byte, resBody []byte, isStream bool, statusCode int) (*UsageMetrics, error)
}

// StreamParser 流式解析接口 (可选实现)
// 如果策略支持流式精准计费，需要实现此接口来逐步处理 Chunk
type StreamParser interface {
	// ParseChunk 解析一个 SSE 数据块或 JSON 块
	// 返回: 增量的 UsageMetrics (通常只包含 OutputTokens), 是否结束
	ParseChunk(chunk []byte) (delta *UsageMetrics, isDone bool, err error)
}
