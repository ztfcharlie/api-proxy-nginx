# 去中心化 API 聚合平台 - 深度技术对话记录

> **日期**: 2025年12月18日
> **背景**: 用户构想构建一个 "BYOK (Bring Your Own Key)" 模式的去中心化 API 聚合平台，连接社会闲散 Key 资源（Agent）与最终用户，由中央平台统一调度、计费、风控。

---

## 一、 核心商业与架构逻辑

### 1.1 核心理念
*   **模式**: 中央平台 (Central Hub) + 子平台 (Edge Agent)。
*   **比喻**: Agent 是“泉眼”，中央平台是“水厂”，只接管子，不生产水。
*   **信任基础**: 
    *   Agent **持有真实 Key**，存储在本地，不上传给中央平台。
    *   中央平台只下发虚拟 Key 给用户。
    *   中央平台负责鉴权、计费、流量分发。

### 1.2 商业模型 (Wholesale Model)
*   **定价权**: **绝对归属中央平台**。Agent 无权直接定价，防止市场混乱。
*   **计费锚点**: 双方共同维护一份 **官方价格表 (Official Price Table)**。
    *   同步机制: 中央平台下发带版本号的价格表 (`price_ver: v102`) 给 Agent。
*   **分润公式**: `Agent 收益 = (官方原价) * (质量分 Tier 系数)`。
    *   **S级 (Tier 1)**: 拿 90% (系数 0.9)。
    *   **A级 (Tier 2)**: 拿 70% (系数 0.7)。
    *   **特惠区**: Agent 可主动申请降级 (如 50%) 以换取高优先级的流量填充。
*   **用户侧定价**: 中央平台可根据市场策略定价 (标准/促销/溢价)，与 Agent 结算逻辑解耦。

---

## 二、 关键技术实现细节

### 2.1 通信架构: WebSocket 反向隧道
*   **痛点**: Agent 位于内网 (NAT 后)，无公网 IP，防火墙阻挡入站连接。
*   **解法**: **反向连接 (Reverse Tunnel)**。
    *   Agent 启动时主动连接 `wss://hub.platform.com`。
    *   保持 TCP 长连接 (Keep-Alive)。
    *   **安全性**: Agent **不监听任何本地端口** (No Listen Port)，黑客无法扫描或直连，物理隔绝外部攻击。

### 2.2 协议透传 (Protocol Pass-through)
*   **目标**: 用户端获得 100% 原生体验 (Native Experience)，支持流式输出 (Streaming)。
*   **实现**: **字节级转发 (Byte-Level Forwarding)**。
    *   **Request**: 中央平台收到 HTTP Body -> 转为二进制 Frame -> WebSocket -> Agent -> OpenAI。
    *   **Response**: Agent 收到 OpenAI Chunk -> 转为二进制 Frame -> WebSocket -> 中央平台 -> 用户。
    *   **原则**: **不解析 JSON** (除了必要的 Header/Usage 提取)，不重组数据，保证原汁原味。
*   **延迟优化**: Zero-Buffer，收到即发，避免 Head-of-Line Blocking。

### 2.3 官方直连强制 (Official Endpoint Enforcement)
*   **约束**: Agent **只能** 连接官方 API (OpenAI/Azure/Anthropic)，禁止连接第三方中转。
*   **技术锁死**:
    *   代码硬编码官方 Endpoint URL。
    *   **DNS/ASN 校验**: Agent 解析目标 IP 后，检查 ASN 是否属于 Microsoft/Cloudflare 等官方网段。如果 IP 属于阿里云/腾讯云 (常见中转)，直接拒绝。

### 2.4 安全认证体系
*   **身份防伪 (Agent 连 Central)**:
    *   **mTLS** 或 **Ed25519 挑战-响应**。
    *   Agent 持有私钥 (生成后永不出本地)，对随机 Nonce 签名。
*   **平台防伪 (Central 连 Agent)**:
    *   **SSL Pinning**: Agent 代码硬编码中央平台证书指纹 (Fingerprint)。
    *   **作用**: 防止 DNS 劫持或中间人攻击 (MITM)。即使黑客伪造了域名，证书指纹对不上，Agent 也会拒绝连接。

---

## 三、 账本与数据一致性 (Accounting & Consistency)

### 3.1 双重账本 (Dual Ledger)
*   **中央**: MySQL/Redis 负责实时扣费。
*   **Agent**: **SQLite (WAL 模式)** + **追加式日志 (AOF)**。
    *   **必要性**: 防止 Agent 断电/宕机导致数据丢失。SQLite 保证事务原子性。

### 3.2 防篡改机制 (Hash Chain)
*   借鉴区块链思想，但不跑公链 (无 Gas 费)。
*   **逻辑**: 每一笔交易记录包含 `Prev_Hash` (上一笔的哈希)。
*   **校验**: 中央平台定期下发 Hash 链尾，Agent 本地计算对比。如果不一致，说明中央平台篡改了账本，Agent 拒绝签名。

### 3.3 异常对账 (Reconciliation)
*   **孤儿单 (Orphan Transaction)**: 
    *   场景: Agent 跑完了，结果发回去了，但网络断了，中央平台没收到。
    *   解法: **Claim Protocol**。Agent 重连后，上传未确认的交易凭证，中央平台补录。
*   **取消同步 (Cancellation)**:
    *   场景: 用户点击“停止生成”。
    *   解法: 中央平台发送 `ABORT` 帧 -> Agent 取消 HTTP Context -> 停止向 OpenAI 付费。

---

## 四、 稳定性与运维风控

### 4.1 限流体系 (Rate Limiting)
*   **中央层**: **Redis Lua 脚本**。分布式限流，防止多网关同时派单给同一个 Agent。
*   **Agent 层**: **Go Token Bucket (内存)**。作为最后一道防线，防止中央平台算错。
*   **UI 交互**:
    *   **小白模式**: 自动探测，遇到 429 错误自动降级 RPM。
    *   **专家模式**: 手动设置 RPM/TPM。

### 4.2 运维生命周期
*   **OTA 升级**: Agent 必须支持自动更新 (Auto-Update)，防止协议变更或证书过期导致全网瘫痪。
*   **数据归档**: MySQL 热数据保留 30 天，冷数据自动归档到 S3，防止数据库膨胀。
*   **灾难恢复 (DR)**: "Rebuild-from-Edge" 工具 —— 从全网 Agent 上传的 SQLite 重建中央数据库。

### 4.3 风控策略
*   **IP 风险**:
    *   Agent 上报 Proxy 配置。
    *   中央平台通过 **Probe 接口 (回响测试)** 验证真实出口 IP。
    *   限制单 IP 挂载账号数 (5-10个)。
*   **反作弊 (Gaming)**: 检测 User 与 Agent 的 IP/钱包关联，防止“自买自卖”刷评分。
*   **内容合规**: 中央平台前置敏感词过滤，违规请求直接拦截，不发给 Agent。日志仅存 Hash 或脱敏元数据。

---

## 五、 遗漏补充点

1.  **多模态带宽**: 图片/音频 (Vision/Audio) 流量大，WebSocket 协议需支持 **分片 (Chunking)**。
2.  **上下文探测**: Agent 初始化时，自动探测模型的真实 Context Window (是 4k 还是 128k)，防止长文本请求失败。
3.  **时区**: 全系统强制使用 **UTC**。
4.  **TOS 规避**: 平台定位为“企业网关”或“算力管理”，避免直接宣传“转售 Key”。
