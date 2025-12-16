package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	"api-proxy/go-gateway/internal/billing"
	"api-proxy/go-gateway/internal/billing/strategy"
	"api-proxy/go-gateway/internal/config"
	"api-proxy/go-gateway/internal/handler"
	"api-proxy/go-gateway/internal/middleware"
	"api-proxy/go-gateway/internal/processor"
	"api-proxy/go-gateway/internal/service"
	"api-proxy/go-gateway/pkg/redis"

	"github.com/gin-gonic/gin"
	_ "github.com/go-sql-driver/mysql"
)

func main() {
	// 1. Load Config
	cfg := config.LoadConfig()

	// 2. Initialize Redis
	if err := redis.Init(cfg.RedisHost, cfg.RedisPort, cfg.RedisPassword, cfg.RedisDB); err != nil {
		log.Fatalf("Failed to initialize Redis: %v", err)
	}
	defer redis.Close()
	log.Println("Redis connected successfully")

	// 3. Initialize MySQL (For Processor)
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True", 
		cfg.DBUser, cfg.DBPass, cfg.DBHost, cfg.DBPort, cfg.DBName)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("[WARN] Failed to connect to MySQL: %v. Processor features will be disabled.", err)
	} else if err := db.Ping(); err != nil {
		log.Printf("[WARN] MySQL Ping failed: %v. Processor features will be disabled.", err)
		db = nil
	} else {
		log.Println("MySQL connected successfully")
		db.SetMaxOpenConns(20)
		db.SetMaxIdleConns(5)
	}

	// 4. Start Background Processors
	if db != nil {
		ctx := context.Background()

		// A. Sync Manager (MySQL -> Redis)
		syncMgr := processor.NewSyncManager(redis.Client, db)
		go syncMgr.Start(ctx)

		// B. Token Manager (Auto Refresh Google Tokens)
		tokenMgr := processor.NewTokenManager(redis.Client, db)
		go tokenMgr.Start(ctx)

		// C. Log Consumer (Redis Stream -> MySQL)
		logConsumer := processor.NewLogConsumer(redis.Client, db)
		go logConsumer.Start(ctx)
		
		log.Println("Background processors started")
	}

	// 5. Initialize Services and Handlers
	authSvc := service.NewAuthService()
	aiProxyHandler := handler.NewProxyHandler()       // AI 转发
	adminProxyHandler := handler.NewAdminProxyHandler(cfg.NodeBackend) // Node.js 转发
	
	// [Added] OAuth2 Handler
	var oauth2Handler *handler.OAuth2Handler
	if db != nil {
		oauth2Handler = handler.NewOAuth2Handler(db)
	}

	// Initialize Billing
	billingEngine := billing.NewEngine()
	billingEngine.Register(&strategy.OpenAIStrategy{})
	billingEngine.Register(&strategy.VertexStrategy{}) // Added Vertex
	settlementSvc := billing.NewSettlementService()

	// 6. Setup Router
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.RequestID())
	r.Use(middleware.CORSMiddleware())

	// A. AI Proxy 核心业务 ( /v1/..., /suno/..., /mj/... )
	// 这些请求由 Go 处理 (鉴权、计费)
	
	// 定义中间件链
	aiMiddleware := []gin.HandlerFunc{
		middleware.CaptureMiddleware(),
		middleware.AuthMiddleware(authSvc),
		middleware.BillingMiddleware(billingEngine, settlementSvc),
	}

	// Group: /v1 (OpenAI, Vertex v1)
	r.Any("/v1/*path", append(aiMiddleware, aiProxyHandler.Proxy)...)

	// Group: /v1beta1 (Vertex v1beta1)
	r.Any("/v1beta1/*path", append(aiMiddleware, aiProxyHandler.Proxy)...)

	// Group: /openai (Azure OpenAI)
	// Example: /openai/deployments/{id}/chat/completions
	r.Any("/openai/*path", append(aiMiddleware, aiProxyHandler.Proxy)...)

	// Group: Vertex AI (Raw "projects" path)
	// Example: /projects/my-project/locations/.../models/gemini-pro:streamGenerateContent
	r.Any("/projects/*path", append(aiMiddleware, aiProxyHandler.Proxy)...)

	// Group: Other AI paths (Suno, Midjourney)
	r.Any("/suno/*path", append(aiMiddleware, aiProxyHandler.Proxy)...)
	r.Any("/mj/*path", append(aiMiddleware, aiProxyHandler.Proxy)...)

	// [Modified] OAuth2 签发端点 (Go 处理)
	if oauth2Handler != nil {
		r.POST("/oauth2.googleapis.com/token", oauth2Handler.TokenEndpoint)
		r.POST("/token", oauth2Handler.TokenEndpoint) // Alias
	} else {
		// Fallback to Node.js if DB failed
		r.POST("/oauth2.googleapis.com/token", adminProxyHandler.Proxy)
	}
	
	// Remove conflicting wildcard routes. 
	// Any other request to /oauth2.googleapis.com/... or /accounts.google.com/... 
	// will automatically fall through to r.NoRoute(), which forwards to Node.js.

	// B. 兜底路由 (Fallback) -> Node.js
	// 所有非 AI 请求 (网页、静态资源、管理 API) 全部转发给 Node.js
	r.NoRoute(adminProxyHandler.Proxy)

	// Health check (Go 自身健康检查)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "go-gateway"})
	})

	// Start Server
	log.Printf("Starting server on port %s", cfg.ServerPort)
	if err := r.Run(":" + cfg.ServerPort); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
