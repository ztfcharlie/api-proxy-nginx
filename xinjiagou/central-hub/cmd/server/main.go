package main

import (
	"central-hub/internal/gateway"
	"central-hub/internal/tunnel"
	"log"
	"net/http"
)

func main() {
	// 1. 初始化 TunnelServer
	wsServer := tunnel.NewTunnelServer()

	// 2. 初始化 Gateway Handler
	gwHandler := gateway.NewHandler(wsServer)

	// 3. 注册路由
	// WebSocket 连接口
	http.HandleFunc("/tunnel/connect", wsServer.HandleConnect)

	// OpenAI 兼容接口
	http.HandleFunc("/v1/chat/completions", gwHandler.HandleOpenAIRequest)

	// 4. 启动 HTTP 服务
	addr := ":8080"
	log.Printf("[Hub] Server starting on %s ...", addr)
	
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("[Hub] Server failed to start: %v", err)
	}
}