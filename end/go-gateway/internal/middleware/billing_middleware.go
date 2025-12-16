package middleware

import (
	"context"
	"api-proxy/go-gateway/internal/billing"
	"api-proxy/go-gateway/internal/model"
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

func BillingMiddleware(billingEngine *billing.Engine, settlementSvc *billing.SettlementService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. 获取 Auth Context
		val, exists := c.Get("auth_context")
		if !exists {
			c.Next()
			return
		}
		authCtx := val.(*model.AuthContext)

		startTime := time.Now()

		// 2. 执行请求 (Proxy)
		c.Next()

		// 3. 请求结束 (Settlement Phase)
		duration := time.Since(startTime)
		
		// 获取由 CaptureMiddleware 捕获的数据
		reqBody, _ := c.Get("request_body")
		resBody, _ := c.Get("response_body")
		statusCode, _ := c.Get("response_status")
		isStreamVal, _ := c.Get("is_stream")
		reqIDVal, _ := c.Get("request_id") // Set by RequestID middleware

		// Type Assertion
		rb, _ := reqBody.([]byte)
		rsb, _ := resBody.([]byte)
		code, _ := statusCode.(int)
		isStream, _ := isStreamVal.(bool)
		reqID, _ := reqIDVal.(string)

		// 异步处理计费
		go func() {
			metrics, err := billingEngine.Calculate(
				context.Background(),
				authCtx.ModelName,
				rb,
				rsb,
				isStream,
				code,
			)
			
			if err != nil {
				log.Printf("[Billing] Calculation failed: %v", err)
				return
			}
			
			// Calculate Cost
			cost := settlementSvc.CalculateCost(authCtx.ModelName, metrics)

			// Log Billing Event
			log.Printf("[Billing] User: %v, Model: %s, Duration: %v, Tokens: %d/%d, Cost: $%.6f", 
				authCtx.Metadata.UserID, authCtx.ModelName, duration, metrics.InputTokens, metrics.OutputTokens, cost)
			
			// Settlement & Logging
			settlementSvc.RecordUsageAndCost(
				context.Background(), 
				reqID, 
				authCtx.Metadata.UserID, 
				authCtx.ChannelID, // Pass ChannelID
				authCtx.ModelName, 
				metrics, 
				cost,
				code, // Status Code
				duration,
			)
		}()
	}
}
