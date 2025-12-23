package main

import (
	"central-hub/internal/billing"
	"central-hub/internal/cache"
	"central-hub/internal/config"
	"central-hub/internal/db"
	"central-hub/internal/gateway"
	"central-hub/internal/middleware"
	"central-hub/internal/tunnel"
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"gopkg.in/natefinch/lumberjack.v2"
)

func main() {
	// Setup Logging
	log.SetOutput(&lumberjack.Logger{
		Filename:   "hub.log",
		MaxSize:    100, // megabytes
		MaxBackups: 5,
		MaxAge:     28, // days
	})

	cfg := config.Load()
	log.Printf("[Config] Loaded configuration. Port: %s", cfg.Port)

	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = "root:123456@tcp(127.0.0.1:3306)/xinjiagou"
	}
	database, err := db.NewDB(dsn)
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "127.0.0.1:6379"
	}
	redisStore := cache.NewRedisStore(redisAddr)
	log.Println("[Cache] Connected to Redis")

	// 注入 database
	wsServer := tunnel.NewTunnelServer(cfg, redisStore, database)
	billMgr := billing.NewManager(database)
	
	gwHandler := gateway.NewHandler(wsServer, billMgr, database, redisStore)

	http.HandleFunc("/tunnel/connect", wsServer.HandleConnect)
	http.HandleFunc("/api/probe/echo", wsServer.HandleEcho)
	
	// Admin API (Protected)
	kickHandler := func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if err := wsServer.KickAgent(id); err != nil {
			http.Error(w, err.Error(), 404)
		} else {
			w.Write([]byte("kicked"))
		}
	}
	http.HandleFunc("/api/admin/kick", middleware.AdminAuth(kickHandler))
	
	http.Handle("/metrics", promhttp.Handler())
	// 通配路由: 接管所有 API 请求 (OpenAI, Anthropic, Google...)
	http.HandleFunc("/", middleware.CORS(middleware.Logging(gwHandler.HandleRequest)))

	// 启动 Worker
	go func() {
		log.Println("[Worker] Reconciliation worker started (Interval: 60s)")
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			count, err := database.ReconcileAgents()
			if err != nil {
				log.Printf("❌ [Worker] Reconcile error: %v", err)
			} else if count > 0 {
				log.Printf("✅ [Worker] Reconciled %d transactions", count)
			}
		}
	}()

	addr := ":" + cfg.Port
	server := &http.Server{
		Addr:              addr,
		Handler:           nil, // Use DefaultServeMux
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       300 * time.Second, // 5 min for LLM streaming
		WriteTimeout:      300 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Printf("[Hub] Server starting on %s ...", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Hub] Server start failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[Hub] Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("[Hub] Server forced to shutdown: %v", err)
	}

	log.Println("[Hub] Server exiting")
}
