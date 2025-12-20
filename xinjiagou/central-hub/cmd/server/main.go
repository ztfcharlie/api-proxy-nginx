package main

import (
	"central-hub/internal/billing"
	"central-hub/internal/gateway"
	"central-hub/internal/tunnel"
	"log"
	"net/http"
)

func main() {
	wsServer := tunnel.NewTunnelServer()
	
	// 初始化计费管理器
	billMgr := billing.NewManager()

	// 注入到 Gateway
	gwHandler := gateway.NewHandler(wsServer, billMgr)

	http.HandleFunc("/tunnel/connect", wsServer.HandleConnect)
	http.HandleFunc("/v1/chat/completions", gwHandler.HandleOpenAIRequest)

	addr := ":8080"
	log.Printf("[Hub] Server starting on %s ...", addr)
	
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("[Hub] Server failed to start: %v", err)
	}
}
