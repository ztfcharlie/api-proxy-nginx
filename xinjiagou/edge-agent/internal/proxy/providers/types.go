package providers

import (
	"edge-agent/internal/protocol"
	"net/http"
)

// Adapter 负责请求重写 (鉴权/URL)
type Adapter interface {
	// RewriteRequest 根据实例配置修改请求 (URL, Headers, Auth)
	// targetURL 是根据 Instance.Endpoint + Request.URL 拼接好的基础 URL
	RewriteRequest(req *http.Request, instance *protocol.InstanceConfig) error
	
	// GetSniffer 返回该厂商的流式计费嗅探器
	GetSniffer() Sniffer
}

// Sniffer 负责响应流的被动分析 (只读不写)
type Sniffer interface {
	// Write 拦截写入的数据流，进行分析
	Write(p []byte) (n int, err error)
	
	// GetUsage 在流结束后返回统计的用量
	GetUsage() *protocol.Usage
}
