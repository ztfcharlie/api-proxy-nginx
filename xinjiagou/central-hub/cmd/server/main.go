package main

import (
	"central-hub/internal/billing"
	"central-hub/internal/config"
	"central-hub/internal/gateway"
	"central-hub/internal/tunnel"
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	cfg := config.Load()
	log.Printf("[Config] Loaded configuration. Port: %s, MaxAgents: %d", cfg.Port, cfg.MaxAgents)

	wsServer := tunnel.NewTunnelServer(cfg)
	billMgr := billing.NewManager()
	gwHandler := gateway.NewHandler(wsServer, billMgr)

	http.HandleFunc("/tunnel/connect", wsServer.HandleConnect)
	http.HandleFunc("/v1/chat/completions", gwHandler.HandleOpenAIRequest)

	addr := ":" + cfg.Port
	server := &http.Server{
		Addr:              addr,
		Handler:           nil,
		ReadHeaderTimeout: cfg.HTTPReadTimeout,
		WriteTimeout:      cfg.HTTPWriteTimeout,
		IdleTimeout:       cfg.HTTPIdleTimeout,
	}

	// 在 Goroutine 中启动 Server，防止阻塞后续的 Shutdown 逻辑
	go func() {
		log.Printf("[Hub] Server starting on %s ...", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Hub] Server start failed: %v", err)
		}
	}()

	// 补丁 2: 优雅停机
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	
	// 阻塞直到收到信号
	<-quit
	log.Println("[Hub] Shutting down server...")

	// 设定 30秒 的宽限期，让正在处理的请求做完
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("[Hub] Server forced to shutdown: %v", err)
	}

	log.Println("[Hub] Server exiting")
}