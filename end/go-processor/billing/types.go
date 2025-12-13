package billing

// Usage 统一的用量结构
type Usage struct {
	PromptTokens        int
	CompletionTokens    int
	TotalTokens         int
	CacheReadTokens     int     // [Added] DeepSeek Cache Hit
	CacheCreationTokens int     // [Added] DeepSeek Cache Miss (Write)
	Images              int     // 图片张数
	VideoSeconds        float64 // 视频秒数
	AudioSeconds        float64 // [Added] 音频秒数 (用于语音转文字计费)
	Cost                float64 // 计算出的总费用 (美元)
}

// Strategy 计费策略接口
type Strategy interface {
	// CanHandle 判断该策略是否能处理这个请求
	CanHandle(model string, path string) bool

	// Calculate 解析请求和响应，计算用量和费用
	// reqBody, resBody: 原始数据
	// contentType: 用于解析 multipart (如音频上传)
	// statusCode: HTTP 状态码 (失败不扣费)
	Calculate(model string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error)
}

// Shared Response Struct for OpenAI-compatible APIs
type openAIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens        int `json:"prompt_tokens"`
		CompletionTokens    int `json:"completion_tokens"`
		TotalTokens         int `json:"total_tokens"`
		// DeepSeek specific fields
		CacheHitTokens      int `json:"prompt_cache_hit_tokens"`
		CacheMissTokens     int `json:"prompt_cache_miss_tokens"`
	} `json:"usage"`
}
