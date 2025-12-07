package billing

// Usage 统一的用量结构
type Usage struct {
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
	Images           int     // 图片张数
	VideoSeconds     float64 // 视频秒数
	Cost             float64 // 计算出的总费用 (美元)
}

// Strategy 计费策略接口
type Strategy interface {
	// CanHandle 判断该策略是否能处理这个请求
	CanHandle(model string, path string) bool

	// Calculate 解析请求和响应，计算用量和费用
	// reqBody, resBody: 原始数据
	// statusCode: HTTP 状态码 (失败不扣费)
	Calculate(model string, reqBody, resBody []byte, statusCode int) (Usage, error)
}
