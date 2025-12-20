package ui

import (
	"encoding/json"
	"log"
	"net/http"
	"sync/atomic"
	"time"
)

// AgentState 用于在 UI 和 核心逻辑之间共享状态
type AgentState struct {
	Connected      bool
	AgentID        string
	HubAddr        string
	TotalRequests  int64
	TotalEarnings  float64
	LastUpdateTime time.Time
}

var GlobalState AgentState

// StartServer 启动本地管理后台
func StartServer(addr string) {
	http.HandleFunc("/", handleDashboard)
	http.HandleFunc("/api/status", handleStatus)

	log.Printf("[UI] Admin Dashboard running at http://%s", addr)
	go http.ListenAndServe(addr, nil)
}

func handleDashboard(w http.ResponseWriter, r *http.Request) {
	// 简单的内嵌 HTML，实际项目可以使用 embed
	html := `
<!DOCTYPE html>
<html>
<head>
    <title>Agent Dashboard</title>
    <style>
        body { font-family: sans-serif; padding: 20px; background: #f0f2f5; }
        .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .stat { font-size: 24px; font-weight: bold; color: #1a73e8; }
        .label { color: #666; font-size: 14px; }
        .status-ok { color: green; }
        .status-fail { color: red; }
    </style>
</head>
<body>
    <h1>🤖 Agent Dashboard</h1>
    
    <div class="card">
        <h3>Status</h3>
        <div id="conn-status" class="stat">Loading...</div>
        <div class="label">ID: <span id="agent-id">-</span></div>
    </div>

    <div class="card">
        <h3>Performance</h3>
        <div class="stat" id="req-count">0</div>
        <div class="label">Total Requests</div>
    </div>

    <div class="card">
        <h3>Earnings (Est.)</h3>
        <div class="stat" id="earnings">$0.00</div>
        <div class="label">Today</div>
    </div>

    <script>
        function update() {
            fetch('/api/status')
                .then(r => r.json())
                .then(data => {
                    const statusDiv = document.getElementById('conn-status');
                    statusDiv.innerText = data.connected ? "🟢 Online" : "🔴 Offline";
                    statusDiv.className = data.connected ? "stat status-ok" : "stat status-fail";
                    
                    document.getElementById('agent-id').innerText = data.agent_id;
                    document.getElementById('req-count').innerText = data.total_requests;
                    document.getElementById('earnings').innerText = "$" + data.total_earnings.toFixed(6);
                });
        }
        setInterval(update, 1000);
        update();
    </script>
</body>
</html>
`
	w.Write([]byte(html))
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	// 获取最新状态
	// 这里要注意并发安全，简化起见直接读
	// 实际上 TotalRequests 建议用 atomic
	
	status := map[string]interface{}{
		"connected":      GlobalState.Connected,
		"agent_id":       GlobalState.AgentID,
		"total_requests": atomic.LoadInt64(&GlobalState.TotalRequests),
		"total_earnings": GlobalState.TotalEarnings, // 浮点数原子操作比较麻烦，这里暂忽略竞争
	}
	
	json.NewEncoder(w).Encode(status)
}
