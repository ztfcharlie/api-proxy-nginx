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
