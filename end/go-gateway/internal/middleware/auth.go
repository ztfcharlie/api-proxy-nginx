package middleware

import (
	"strings"

	"api-proxy/go-gateway/internal/service"

	"github.com/gin-gonic/gin"
)

// AuthMiddleware 鉴权中间件
func AuthMiddleware(authSvc *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. 获取 Authorization Header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(401, gin.H{"error": "Unauthorized", "message": "Missing Authorization header"})
			c.Abort()
			return
		}

		// 2. 提取 Bearer Token
		token := strings.TrimPrefix(authHeader, "Bearer ")
		token = strings.TrimSpace(token)
		if token == "" {
			c.JSON(401, gin.H{"error": "Unauthorized", "message": "Invalid token format"})
			c.Abort()
			return
		}

		// 3. 提取模型名称 (从 URI 或 Body)
		// 此时 CaptureMiddleware 已经读取并恢复了 Body，且将其存入了 Context (为了保险也可以再读一次，但直接用 Context 里的更快)
		var bodyBytes []byte
		if v, ok := c.Get("request_body"); ok {
			bodyBytes, _ = v.([]byte)
		}
		
		uri := c.Request.RequestURI
		modelName := ExtractModelName(uri, bodyBytes) 
		
		// 4. 调用 Auth Service 进行鉴权和路由选择
		authCtx, err := authSvc.AuthenticateClient(c.Request.Context(), token, modelName, uri)
		if err != nil {
			// 根据错误类型返回 401 或 429
			status := 401
			if strings.Contains(err.Error(), "rate limited") {
				status = 429
			} else if strings.Contains(err.Error(), "no routes") {
				status = 503
			}
			c.JSON(status, gin.H{"error": "Auth Failed", "message": err.Error()})
			c.Abort()
			return
		}

		// 5. 将鉴权结果存入 Context
		c.Set("auth_context", authCtx)

		// 6. 清理 Authorization 头 (为了安全，后续 Proxy 会重新设置)
		c.Request.Header.Del("Authorization")

		c.Next()
	}
}
