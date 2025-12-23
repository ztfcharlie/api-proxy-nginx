 Edit docs\development_roadmap.md: # 去中心化 API 聚合平台 - 开发路线图 (Devel... => # 去中心化 API 聚合平台 - 开发路线图 (Devel...                                         │
│                                                                                                                                                                               │
│  9   **目标**: 打通 Hub 与 Agent 的 WebSocket 双向管道，实现连接管理与基础透传。                                                                                              │
│ 10                                                                                                                                                                            │
│ 11   ### 1. Hub 端 (Server)                                                                                                                                                   │
│ 12 - - [ ] **WS 服务端**: 搭建 WebSocket Server，监听 `/tunnel/connect`。                                                                                                     │
│ 13 - - [ ] **连接管理**: 实现 `AgentID -> Connection` 的映射表，支持断线检测。                                                                                                │
│ 14 - - [ ] **指令下发**: 实现内部接口，允许通过 HTTP 触发向 Agent 发送消息。                                                                                                  │
│ 12 + - [x] **WS 服务端**: 搭建 WebSocket Server，监听 `/tunnel/connect`。                                                                                                     │
│ 13 + - [x] **连接管理**: 实现 `AgentID -> Connection` 的映射表，支持断线检测。                                                                                                │
│ 14 + - [x] **指令下发**: 实现内部接口，允许通过 HTTP 触发向 Agent 发送消息。                                                                                                  │
│ 15                                                                                                                                                                            │
│ 16   ### 2. Agent 端 (Client)                                                                                                                                                 │
│ 17 - - [ ] **WS 客户端**: 启动即自动连接 Hub，支持指数退避重连。                                                                                                              │
│ 18 - - [ ] **消息循环**: 监听 Hub 指令，打印日志并原样回传 (Echo)。                                                                                                           │
│ 19 - - [ ] **跨平台适配**: 预留 Windows/Linux/Mac 的构建标记 (Build Tags)。                                                                                                   │
│ 17 + - [x] **WS 客户端**: 启动即自动连接 Hub，支持指数退避重连。                                                                                                              │
│ 18 + - [x] **消息循环**: 监听 Hub 指令，打印日志并原样回传 (Echo)。                                                                                                           │
│ 19 + - [x] **跨平台适配**: 预留 Windows/Linux/Mac 的构建标记 (Build Tags)。                                                                                                   │
│ 20                                                                                                                                                                            │
│ 21   ### 3. 协议定义                                                                                                                                                          │
│ 22 - - [ ] **JSON 协议**: 定义基础通信包结构 (`Type`, `ReqID`, `Payload`)。                                                                                                   │
│ 22 + - [x] **JSON 协议**: 定义基础通信包结构 (`Type`, `ReqID`, `Payload`)。                                                                                                   │
│ 23                                                                                                                                                                            │
│ 24   **✅ 验收标准**: Agent 启动能连上 Hub；Hub 能发消息给 Agent；Agent 能回话。                                                                                              │
│ 25                                                                                                                                                                            │
│ 29   **目标**: 实现 HTTP -> WebSocket -> HTTP 的完整透传，支持流式响应。                                                                                                      │
│ 30                                                                                                                                                                            │
│ 31   ### 1. Agent 端                                                                                                                                                          │
│ 32 - - [ ] **HTTP Client**: 封装标准请求，向 `api.openai.com` 发起真实调用。                                                                                                  │
│ 33 - - [ ] **流式转发**: 实时读取 SSE 响应，按 Chunk 封装发送给 Hub。                                                                                                         │
│ 34 - - [ ] **白名单锁死**: 硬编码官方 Endpoint，禁止自定义 URL。                                                                                                              │
│ 32 + - [x] **HTTP Client**: 封装标准请求，向 `api.openai.com` 发起真实调用。                                                                                                  │
│ 33 + - [x] **流式转发**: 实时读取 SSE 响应，按 Chunk 封装发送给 Hub。                                                                                                         │
│ 34 + - [x] **白名单锁死**: 硬编码官方 Endpoint，禁止自定义 URL。                                                                                                              │
│ 35                                                                                                                                                                            │
│ 36   ### 2. Hub 端                                                                                                                                                            │
│ 37 - - [ ] **User Gateway**: 暴露 `/v1/chat/completions` 接口。                                                                                                               │
│ 38 - - [ ] **流式写入**: 接收 Agent 的 Frame，实时 Flush 给用户。                                                                                                             │
│ 37 + - [x] **User Gateway**: 暴露 `/v1/chat/completions` 接口。                                                                                                               │
│ 38 + - [x] **流式写入**: 接收 Agent 的 Frame，实时 Flush 给用户。                                                                                                             │
│ 39                                                                                                                                                                            │
│ 40   **✅ 验收标准**: 使用 NextChat 等客户端连接 Hub，能流畅对话，打字机效果无卡顿。                                                                                          │
│ 41                                                                                                                                                                            │
│ 45   **目标**: 构建零信任网络，防黑客、防伪造。                                                                                                                               │
│ 46                                                                                                                                                                            │
│ 47   ### 1. Agent 端                                                                                                                                                          │
│ 48 - - [ ] **密钥生成**: 集成 Ed25519，生成/加载 `agent.key`。                                                                                                                │
│ 49 - - [ ] **签名验证**: 实现挑战-响应机制 (Challenge-Response)。                                                                                                             │
│ 50 - - [ ] **SSL Pinning**: 硬编码 Hub 证书指纹。                                                                                                                             │
│ 48 + - [x] **密钥生成**: 集成 Ed25519，生成/加载 `agent.key`。                                                                                                                │
│ 49 + - [x] **签名验证**: 实现挑战-响应机制 (Challenge-Response)。                                                                                                             │
│ 50 + - [x] **SSL Pinning**: 硬编码 Hub 证书指纹。                                                                                                                             │
│ 51                                                                                                                                                                            │
│ 52   ### 2. Hub 端                                                                                                                                                            │
│ 53 - - [ ] **注册中心**: 数据库存储 Agent 公钥。                                                                                                                              │
│ 54 - - [ ] **握手校验**: 验证 Agent 签名，非法连接直接断开。                                                                                                                  │
│ 55 - - [ ] **用户鉴权**: 验证 `Authorization` 头。                                                                                                                            │
│ 53 + - [x] **注册中心**: 数据库存储 Agent 公钥。                                                                                                                              │
│ 54 + - [x] **握手校验**: 验证 Agent 签名，非法连接直接断开。                                                                                                                  │
│ 55 + - [x] **用户鉴权**: 验证 `Authorization` 头。                                                                                                                            │
│ 56                                                                                                                                                                            │
│ 57   **✅ 验收标准**: 修改 Agent 私钥或 Hub 证书，连接必须被拒绝。                                                                                                            │
│ 58                                                                                                                                                                            │
│ 62   **目标**: 精确计费，防止篡改。                                                                                                                                           │
│ 63                                                                                                                                                                            │
│ 64   ### 1. Hub 端                                                                                                                                                            │
│ 65 - - [ ] **价格表**: MySQL 存储各模型单价。                                                                                                                                 │
│ 66 - - [ ] **扣费逻辑**: 解析 Usage -> 扣款 -> 记账。                                                                                                                         │
│ 67 - - [ ] **Hash 链**: 计算并下发交易 Hash。                                                                                                                                 │
│ 65 + - [x] **价格表**: MySQL 存储各模型单价。                                                                                                                                 │
│ 66 + - [x] **扣费逻辑**: 解析 Usage -> 扣款 -> 记账。                                                                                                                         │
│ 67 + - [x] **Hash 链**: 计算并下发交易 Hash。                                                                                                                                 │
│ 68                                                                                                                                                                            │
│ 69   ### 2. Agent 端                                                                                                                                                          │
│ 70 - - [ ] **SQLite 集成**: 实现本地 WAL 模式数据库。                                                                                                                         │
│ 71 - - [ ] **双重核对**: 本地复算金额，对比 Hub Hash，一致则落盘。                                                                                                            │
│ 70 + - [x] **SQLite 集成**: 实现本地 WAL 模式数据库。                                                                                                                         │
│ 71 + - [x] **双重核对**: 本地复算金额，对比 Hub Hash，一致则落盘。                                                                                                            │
│ 72                                                                                                                                                                            │
│ 73   **✅ 验收标准**: Hub MySQL 与 Agent SQLite 数据完全一致 (精确到小数点后6位)。                                                                                            │
│ 74                                                                                                                                                                            │
│ 78   **目标**: 生产环境就绪，抗并发，易维护。                                                                                                                                 │
│ 79                                                                                                                                                                            │
│ 80   ### 1. Agent 端                                                                                                                                                          │
│ 81 - - [ ] **Web UI**: 本地管理界面 (localhost)。                                                                                                                             │
│ 82 - - [ ] **限流**: 内存令牌桶保护。                                                                                                                                         │
│ 83 - - [ ] **OTA**: 自动更新模块。                                                                                                                                            │
│ 81 + - [x] **Web UI**: 本地管理界面 (localhost)。                                                                                                                             │
│ 82 + - [x] **限流**: 内存令牌桶保护。                                                                                                                                         │
│ 83 + - [x] **OTA**: 自动更新模块。                                                                                                                                            │
│ 84                                                                                                                                                                            │
│ 85   ### 2. Hub 端                                                                                                                                                            │
│ 86 - - [ ] **Redis 限流**: 全局 RPM 计数。                                                                                                                                    │
│ 87 - - [ ] **IP 探测**: Probe 接口验证真实 IP。                                                                                                                               │
│ 88 - - [ ] **取消同步**: 处理客户端断开事件。                                                                                                                                 │
│ 86 + - [x] **Redis 限流**: 全局 RPM 计数。                                                                                                                                    │
│ 87 + - [x] **IP 探测**: Probe 接口验证真实 IP。                                                                                                                               │
│ 88 + - [x] **取消同步**: 处理客户端断开事件。                                                                                                                                 │
│ 89                                                                                                                                                                            │
│ 90   **✅ 验收标准**: 高并发压测不崩；断网后自动补单；软件能自动升级。


 1. 路由策略 (Smart Routing)                                                                                                                                              │
│          * 现状: 硬编码 targetAgentID = "auth-agent-001"。                                                                                                                    │
│          * 任务:                                                                                                                                                              │
│              * 实现 负载均衡器: 维护一个 AvailableAgents 列表。                                                                                                               │
│              * 策略: 轮询 (Round Robin) 或 随机 (Random)。                                                                                                                    │
│              * 健康检查: 如果 Agent 连续 3 次报错，暂时踢出列表。                                                                                                             │
│      2. 支持更多的厂商 (Multi-Provider)                                                                                                                                       │
│          * 任务:                                                                                                                                                              │
│              * 在 Agent 的 config.yaml 里允许配置 anthropic_key。                                                                                                             │
│              * 在 worker.go 里根据 model 前缀判断：如果是 claude-* -> 转发到 api.anthropic.com。

          * 在 worker.go 里根据 model 前缀判断：如果是 claude-* -> 转发到 api.anthropic.com。                                                                              │
│                                                                                                                                                                               │
│     第四优先级：管理与运维 (Admin & Ops)                                                                                                                                      │
│                                                                                                                                                                               │
│      1. Hub 管理后台 API                                                                                                                                                      │
│          * 任务:                                                                                                                                                              │
│              * GET /admin/agents: 列出在线 Agent。                                                                                                                            │
│              * POST /admin/kick: 强制踢某个 Agent 下线。                                                                                                                      │
│              * POST /admin/price: 动态修改价格表（并触发广播）。                                                                                                              │
│      2. Agent 自动更新 (OTA)
 2. Agent 自动更新 (OTA)                                                                                                                                                  │
│          * 任务:                                                                                                                                                              │
│              * Hub 提供 /files/agent/latest 下载接口。                                                                                                                        │
│              * Agent 启动时检查 Hash，不同则下载 -> mv agent.exe agent.old -> mv new.exe agent.exe -> 重启。



你当前的路由策略是下面这样的吗？
智能路由策略 (Smart Routing)
现状： 目前 targetAgentID 采用硬编码（如 "auth-agent-001"），缺乏灵活性。
开发任务：
负载均衡器： 构建并维护一个 AvailableAgents 实时列表。
路由算法： 实现轮询 (Round Robin) 或随机 (Random) 分发策略。
自愈机制（健康检查）： 监控 Agent 状态，若某个 Agent 连续报错 3 次，自动从可用列表中移除。
但是实际业务是下面这样的，目前的开发阶段，我是否应该考虑下面的具体实现细则：
1/hub调用agent提供的渠道的方法有：
1.1/用户生成虚拟token的时候选定了固定的agent提供的渠道【agent可以是多个，渠道可以是多条渠道】，
1.3/用户生成虚拟token的时候选择了指定的模型，选择一定评分等级的渠道提供服务，举例，生成openai供应商的虚拟token-abc，需要使用gpt-4o模型，使用评级是B级的agent的openai渠道，综合RPM 和TPM限流， 当前负载，稳定性，可用性，系统的评级的一套规则，选择渠道给客户服务。
1.4/用户生成虚拟token的时候选择了指定的模型，不管渠道等级，能服务就行，举例，生成openai供应商的虚拟token-abc，需要使用gpt-4o模型，系统按可用性，稳定性，价格，负载情况，反馈速度等，一套规则，选择agent的渠道提供服务。

以上是选择渠道的目前想到的规则，可能你需要写一个函数，方便以后修改选择渠道的方法。



下一步，我们可以完善路由策略，实现你提到的 “根据用户等级强制绑定” 或 “价格优先策略”。请指示！




日志验证：
   1. 连接成功: Agent connected. Providers: map[openai:{[gpt-4 gpt-3.5-turbo]}]
   2. 路由成功: Mock GPT-4 请求被正确路由。
   3. 计费成功: Cost: $0.000450。

  这证明我们的 Hub 路由改造 和 Agent 多厂商上报 机制已经工作正常。

  下一步计划 (Phase 6: Multi-Provider Support)

  现在基础打好了，我们可以开始真正的“多厂商接入”了。

   1. 编写新的测试脚本 (`tests/stage6/test_anthropic.go`)：
       * 模拟用户使用 sk-ant-xxx Key。
       * 请求 claude-3-opus。
       * 验证是否路由失败（预期内，因为目前 mock agent 只报了 openai）。
       * 等待 Agent 动态更新添加 anthropic 支持。
       * 再次请求，验证成功。

   2. 实现 Agent 的 Anthropic 适配器:
       * 目前 proxy 还是写死的 OpenAI Mock。
       * 我们需要让 Agent 根据 TargetProvider 选择不同的处理逻辑。

  你觉得先写测试脚本验证路由逻辑，还是直接开始写 Agent 的适配器？

  现在hub的API接口，适配openai，anthropic，aws bedrock，Azure openai，gcp aistudio，gcp vertex，deepseek，Qwen的大模型的文本，图片，语音，视频等的全方位的接口了吗？



既然 Mock 跑通了，是时候做真家伙了。

  建议开始 Phase 7: Real Adapters & Sniffers。
  我们需要把 edge-agent/internal/proxy/worker.go 里的 MockMode 逻辑替换为真实的 Usage Sniffer 和 Request Forwarder。

  具体工作：
   1. 实现 Anthropic Sniffer: 解析 Claude 的 SSE流，提取 usage。
   2. 实现 Universal Forwarder: 根据 InstanceConfig 里的 Endpoint 和 Key，发起真实 HTTP 请求。

  你准备好开始写真实的转发逻辑了吗？
  


  2. ⚠️ 需要微调路由逻辑 (Minor Tweak Needed)
   * Azure OpenAI:
       * 问题: Azure 的模型名称通常不在 Body 的 JSON 里，而是在 URL 路径里（例如 /openai/deployments/{my-gpt-4}/...）。
       * 现状: 我们的 sniffModelName 目前只看 Body。如果 Body 里没 model 字段，Hub 会认为 model 是 "unknown"，可能导致路由不到正确的 Agent 实例。
       * 解决: 修改 Hub，增加对 URL 路径的正则提取逻辑。

   * Google Gemini (Vertex AI / AI Studio):
       * 问题: Google 有时用 URL 参数 ?key=... 鉴权，有时用 OAuth2 Bearer Token。
       * 现状: 只要客户端发来的请求带有正确的鉴权头，我们能透传。但如果依赖 Agent 本地持有 Service Account JSON 来生成 Token，目前 Agent 还缺这个“动态生成 Token”的逻辑。

  3. ❌ 尚未支持 (Requires New Logic)
   * AWS Bedrock:
       * 问题: AWS 不使用简单的 Key，而是使用 AWS SigV4 签名（极其复杂，需要 AccessKey/SecretKey 对 Headers/Body 进行哈希计算）。
       * 现状: 我们的 Agent 目前是“盲转发”。如果把没签名的请求发给 AWS，会直接报错。
       * 解决: 必须在 Agent 端实现 AWSAdapter，拦截请求 -> 重新计算签名 -> 发送。

   * Realtime API (WebSocket):
       * 问题: OpenAI 的 GPT-4o Realtime API 是纯 WebSocket 连接。
       * 现状: 我们的 Hub 目前是 http.HandleFunc，只接受 HTTP 请求。虽然底层隧道是 WS，但入口不支持 WS 握手升级。
       * 解决: Hub 需要支持 WebSocket 流量的劫持与透传。

  4. 结论与建议

  你的系统目前对于 SaaS 类 API (OpenAI/Claude) 已经是 Ready 的。
  对于 PaaS/Cloud 类 API (Azure/AWS/GCP)，需要在 Agent 端补充鉴权适配器。



  在hub测，我们将来会有一个违规内容过滤的关口，所有的API请求数据都会经过我们一个调用大模型API进行prompt，图片等的违规，之后通过的，才会下发到上游，不通过的直接提示
  {
    "error": {
        "code": "sensitive_words_detected",
        "message": "Content moderation failed with status 401",
        "param": "",
        "type": "hub_error"
    }
},所以你需要留好一个接入的口子。