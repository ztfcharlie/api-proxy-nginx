package handler

import (
	"crypto/tls"
	"net/http"
	"net/http/httputil"
	"strings"

	"api-proxy/go-gateway/internal/model"

	"github.com/gin-gonic/gin"
)

type ProxyHandler struct{}

func NewProxyHandler() *ProxyHandler {
	return &ProxyHandler{}
}

func (h *ProxyHandler) Proxy(c *gin.Context) {
	// 1. 获取鉴权上下文
	val, exists := c.Get("auth_context")
	if !exists {
		c.JSON(500, gin.H{"error": "Internal Error", "message": "Auth context missing"})
		return
	}
	authCtx := val.(*model.AuthContext)

	// 2. 构造 ReverseProxy
	director := func(req *http.Request) {
		// 设置目标 Scheme 和 Host
		req.URL.Scheme = "https"
		if strings.Contains(authCtx.TargetHost, "api-proxy-nodejs") {
			req.URL.Scheme = "http" // Mock 模式
		}
		req.URL.Host = authCtx.TargetHost
		req.Host = authCtx.TargetHost

		// 设置鉴权头
		if authCtx.ChannelType == "azure" {
			req.Header.Set("api-key", authCtx.RealToken)
		} else {
			req.Header.Set("Authorization", "Bearer "+authCtx.RealToken)
		}

		// 移除隐私头
		req.Header.Del("X-Forwarded-For")
		req.Header.Del("X-Real-IP")
	}

	proxy := &httputil.ReverseProxy{
		Director: director,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // 忽略证书校验 (仅开发用，生产应配置 CA)
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			// 自定义错误处理
			w.WriteHeader(http.StatusBadGateway)
			w.Write([]byte(`{"error": "Upstream Error", "message": "` + err.Error() + `"}`))
		},
	}

	// 3. 执行代理
	proxy.ServeHTTP(c.Writer, c.Request)
}
