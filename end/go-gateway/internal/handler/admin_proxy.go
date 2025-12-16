package handler

import (
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/gin-gonic/gin"
)

type AdminProxyHandler struct {
	target *url.URL
	proxy  *httputil.ReverseProxy
}

func NewAdminProxyHandler(targetURL string) *AdminProxyHandler {
	target, err := url.Parse(targetURL)
	if err != nil {
		panic(err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	
	// 自定义 Director 以支持前缀剥离或保持
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = target.Host // 重要：修改 Host 头
	}

	return &AdminProxyHandler{
		target: target,
		proxy:  proxy,
	}
}

func (h *AdminProxyHandler) Proxy(c *gin.Context) {
	h.proxy.ServeHTTP(c.Writer, c.Request)
}
