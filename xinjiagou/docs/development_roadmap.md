# 去中心化 API 聚合平台 - 开发路线图 (Development Roadmap)

> **目标**: 构建一个商业级的、去中心化的 API 聚合与分发平台。
> **原则**: 模块化开发，阶段性交付，测试驱动。

---

## 阶段一：通信与隧道核心 (The Tunnel Core)
**目标**: 打通 Hub 与 Agent 的 WebSocket 双向管道，实现连接管理与基础透传。

### 1. Hub 端 (Server)
- [x] **WS 服务端**: 搭建 WebSocket Server，监听 `/tunnel/connect`。
- [x] **连接管理**: 实现 `AgentID -> Connection` 的映射表，支持断线检测。
- [x] **指令下发**: 实现内部接口，允许通过 HTTP 触发向 Agent 发送消息。

### 2. Agent 端 (Client)
- [x] **WS 客户端**: 启动即自动连接 Hub，支持指数退避重连。
- [x] **消息循环**: 监听 Hub 指令，打印日志并原样回传 (Echo)。
- [x] **跨平台适配**: 预留 Windows/Linux/Mac 的构建标记 (Build Tags)。

### 3. 协议定义
- [x] **JSON 协议**: 定义基础通信包结构 (`Type`, `ReqID`, `Payload`)。

**✅ 验收标准**: Agent 启动能连上 Hub；Hub 能发消息给 Agent；Agent 能回话。

---

## 阶段二：OpenAI 协议透传 (The Proxy Layer)
**目标**: 实现 HTTP -> WebSocket -> HTTP 的完整透传，支持流式响应。

### 1. Agent 端
- [x] **HTTP Client**: 封装标准请求，向 `api.openai.com` 发起真实调用。
- [x] **流式转发**: 实时读取 SSE 响应，按 Chunk 封装发送给 Hub。
- [x] **白名单锁死**: 硬编码官方 Endpoint，禁止自定义 URL。

### 2. Hub 端
- [x] **User Gateway**: 暴露 `/v1/chat/completions` 接口。
- [x] **流式写入**: 接收 Agent 的 Frame，实时 Flush 给用户。

**✅ 验收标准**: 使用 NextChat 等客户端连接 Hub，能流畅对话，打字机效果无卡顿。

---

## 阶段三：安全与鉴权 (Security)
**目标**: 构建零信任网络，防黑客、防伪造。

### 1. Agent 端
- [x] **密钥生成**: 集成 Ed25519，生成/加载 `agent.key`。
- [x] **签名验证**: 实现挑战-响应机制 (Challenge-Response)。
- [x] **SSL Pinning**: 硬编码 Hub 证书指纹。

### 2. Hub 端
- [x] **注册中心**: 数据库存储 Agent 公钥。
- [x] **握手校验**: 验证 Agent 签名，非法连接直接断开。
- [x] **用户鉴权**: 验证 `Authorization` 头。

**✅ 验收标准**: 修改 Agent 私钥或 Hub 证书，连接必须被拒绝。

---

## 阶段四：计费与账本 (Billing)
**目标**: 精确计费，防止篡改。

### 1. Hub 端
- [x] **价格表**: MySQL 存储各模型单价。
- [x] **扣费逻辑**: 解析 Usage -> 扣款 -> 记账。
- [x] **Hash 链**: 计算并下发交易 Hash。

### 2. Agent 端
- [x] **SQLite 集成**: 实现本地 WAL 模式数据库。
- [x] **双重核对**: 本地复算金额，对比 Hub Hash，一致则落盘。

**✅ 验收标准**: Hub MySQL 与 Agent SQLite 数据完全一致 (精确到小数点后6位)。

---

## 阶段五：运维与风控 (Ops)
**目标**: 生产环境就绪，抗并发，易维护。

### 1. Agent 端
- [x] **Web UI**: 本地管理界面 (localhost)。
- [x] **限流**: 内存令牌桶保护。
- [x] **OTA**: 自动更新模块。

### 2. Hub 端
- [x] **Redis 限流**: 全局 RPM 计数。
- [x] **IP 探测**: Probe 接口验证真实 IP。
- [x] **取消同步**: 处理客户端断开事件。

**✅ 验收标准**: 高并发压测不崩；断网后自动补单；软件能自动升级。

---

## 环境配置备忘
*   **开发环境**: Windows (本机)
*   **数据库**: MySQL (localhost, root, 123456)
*   **缓存**: Redis (localhost, 无密码/123456)
*   **跨平台**: 代码需考虑 Linux/Mac 适配 (路径分隔符、换行符等使用标准库处理)。




  当前里程碑总结 (Phase 8 Completed)

   1. 架构全覆盖: 实现了 OpenAI, Anthropic, Google (Vertex/Studio), AWS (Bedrock), Azure 五大主流厂商的适配器。
   2. SDK 集成: 成功引入并集成了 AWS 和 Google 的官方 SDK 鉴权组件，保证了签名逻辑的准确性。
   3. 真实转发: 彻底移除了 Mock 逻辑，Agent 现在是一个真正具备“多语种”能力的 API 代理。

  现在的系统能力

   * Request: 用户发任何格式的请求 -> Hub 透传 -> Agent 根据 Instance 配置重写 Header/URL/Auth -> 发送给厂商。
   * Response: 厂商返回任何格式 -> Agent 透传给 Hub -> Hub 透传给用户。
   * Billing:
       * OpenAI/Anthropic: 支持流式 Usage 嗅探。
       * Google/AWS/Azure: 具备嗅探框架（目前是占位符或简单实现，待厂商返回真实数据后微调）。

  ---

  下一步计划：迈向生产环境 (Phase 9: Production Hardening)

  现在的代码虽然功能全了，但离“敢在生产环境跑”还有一段距离。我们需要做 "硬化" (Hardening) 工作。

  1. 密钥安全 (Key Security)
  目前 InstanceConfig.ID 被滥用来存储 Key（甚至 AK:SK）。这在测试时方便，在生产环境是灾难。
  任务: 实现本地加密 KeyStore。
   * Agent 启动时要求输入密码。
   * 配置文件里的 Key 是加密存储的。
   * 运行时解密到内存。

  2. 错误处理与重试 (Resilience)
  如果 AWS 签名过期了怎么办？如果 Google Token 刷新失败怎么办？
  任务:
   * 实现 TokenRefresher (针对 Vertex)。
   * 实现 RetryMiddleware (针对 429/5xx)。

  3. 性能优化 (Performance)
  AWS Adapter 里为了计算 Hash 读取了整个 Body。如果用户上传一个 10MB 的 PDF 给 Claude，内存会爆吗？
  任务: 优化流式转发，尽量避免全量 ReadAll。
  (注: AWS SigV4 必须算 Payload Hash，所以不得不读。但我们可以限制最大 Body Size)

  4. 前端管理面板 (UI)
  目前的 UI 只是个 Mock。
  任务: 实现一个真正的 Web 界面，允许用户添加/删除 Instance，查看实时 RPM 和收益。


  既然基础设施已经非常完善，我建议我们可以开始 Phase 9: Production Hardening。

   1. KeyStore: 实现本地加密存储，不再把 AK/SK 写在 ID 里（那个 AKID:SECRET:Region 是个巨大的安全隐患）。
   2. Retry: 当 Google 返回 200 空 Body 这种诡异情况时，Agent 应该能识别并重试，或者返回明确的错误给 Hub。
   3. UI: 做一个好一点的管理界面，方便你配置这些复杂的 Instance。

  你最关心哪一个方向？还是说你想先部署上线跑一跑试试？