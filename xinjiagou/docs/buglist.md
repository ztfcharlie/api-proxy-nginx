 3. Agent Streamer 重复关闭 Panic
       * 位置: edge-agent/internal/proxy/streamer.go
       * 现象: WriteChunk 在检测到 isFinal 时会 close(s.chunkChan)。但如果 Hub 此时也断开连接触发 Cleanup，或者并发写入，可能导致 向已关闭的 channel 发送数据 或 重复关闭
         channel，引发 Panic。
       * 修复: 使用 sync.Once 保护关闭操作，写入前检查状态。

   4. Google TokenSource 竞态条件
       * 位置: edge-agent/internal/proxy/providers/google.go
       * 现象: val, loaded := a.tokenSources.Load(id) -> if !loaded { ... Store }。这不是原子的。两个并发请求可能同时创建两个 TokenSource，虽然不崩，但浪费资源且可能触发 API
         限制。
       * 修复: 使用 sync.Map 的 LoadOrStore 方法。

   5. Redis 锁死风险 (永久限流)
       * 位置: central-hub/internal/gateway/handler.go
       * 现象: h.redis.IncrUserActive。如果 Hub 在处理请求过程中 Crash 了（Panic 或 OOM），defer DecrUserActive 不会执行（如果是硬 Crash）。Redis
         里的计数器永远不减，用户被永久限流。
       * 修复: 给 Redis Key 设置 TTL (过期时间)，例如 5 分钟自动释放。

   6. Hub HTTP Server 默认无限超时
       * 位置: central-hub/cmd/server/main.go
       * 现象: config.Load 读取环境变量，如果变量未设置，默认是 0（无限）。慢连接攻击 (Slowloris) 可以耗尽 Hub 连接数。
       * 修复: 在 Config Loader 里设置合理的默认值 (ReadHeaderTimeout=5s, etc.)。

  🟠 逻辑与边界条件 (Logic & Edge Cases)

   7. Sniffer 缓冲区溢出丢数据
       * 位置: OpenAISniffer.Write
       * 现象: if s.buf.Len() > 1MB { s.buf.Reset() }。如果重置发生，缓冲区里的“前半截”数据丢了。接下来的 Write 写入的是“后半截”，拼起来是无效 JSON。
       * 修复: Reset 时应该保留未处理的尾部数据（Move memory），或者增加 RingBuffer 机制。

   8. Azure URL 路径重复拼接
       * 位置: edge-agent/internal/proxy/providers/azure.go
       * 现象: GetBaseURL 返回的可能是完整 URL（包含 /chat/completions?）。worker.go 又拼了一次 s.Meta.URL。导致请求变成 https://.../chat/completions/chat/completions。
       * 修复: 明确 GetBaseURL 只返回 Host 还是包含 Path，并在 worker 里做 Trim 处理。

   9. Gateway 路由死胡同
       * 位置: central-hub/internal/gateway/handler.go
       * 现象: 如果 sniffModelName 没找到 model (返回 "unknown")，且请求是 OpenAI 格式（无 Provider 前缀）。Router 会去搜 Provider=openai, Model=unknown 的 Agent。显然找不到。
       * 修复: Router 应该有一个 Default Fallback 机制（如：如果找不到特定 Model，找任意支持 OpenAI 的 Agent）。

   10. AWS 时钟偏移导致签名失败
       * 位置: edge-agent
       * 现象: AWS SigV4 验证非常严格。如果 Agent 所在服务器时间与 AWS 误差超过 5 分钟，请求 100% 失败。
       * 修复: 启动时检查 NTP 同步状态，或者在收到 AWS RequestTimeTooSkewed 错误时自动校准偏移量。

  🟡 运维与代码质量 (Ops & Quality)

   11. 日志注入攻击风险: 直接 Log body 或 url，如果包含换行符，可伪造日志。
   12. 缺少 Health Check 端点: K8s 部署需要 /healthz。
   13. Agent UI 服务无超时: ui.StartServer 用的默认 HTTP Server，容易被攻击。
   14. Worker 协程泄露: io.Pipe 的 Close 时机虽然修复了，但 ActiveStreams Map 如果没有正确 Delete (如逻辑分支遗漏)，会导致 Map 无限增长。
   15. SQL 事务隔离级别: 默认是 Repeatable Read，高并发扣费可能导致死锁（虽然我们在代码里加了重试，但这影响性能）。
   16. PriceTable 热更新延迟: Hub 修改价格后，Gateway 是去 BillingManager 拿的。如果 BillingManager 只是定期从 DB 拉取，会有延迟。需确认通知机制。
   17. Websocket Write 阻塞: SafeWrite 有锁。如果网络卡顿，锁持有时间过长，会阻塞其他 Goroutine（比如心跳）。
   18. Token 精度截断: 虽然用了 Decimal，但如果费率极低（如 $0.0000001），Round(6) 后变成 0，导致免费使用。
   19. Context Cancel 传播延迟: Hub 发送 Abort 包，Agent 收到包再 Cancel Context。中间有网络延迟。
   20. 错误信息泄露: sendResponse 把 err.Error() 直接发给 Hub 再给用户。可能泄露 Agent 内部路径或 IP 信息。