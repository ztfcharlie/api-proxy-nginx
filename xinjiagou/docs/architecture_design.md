# 去中心化 API 聚合平台架构设计文档

## 1. 核心架构 (Core Architecture)

### 1.1 总体设计
*   **模式**: 中央枢纽 (Central Hub) + 边缘代理 (Edge Agents)。
*   **通信协议**: WebSocket 反向隧道 (Reverse Tunnel)。
    *   Agent 主动连接中央平台，不监听任何公网端口。
    *   支持 HTTP/2 多路复用，适合流式 (Streaming) 传输。

### 1.2 角色定义
*   **中央平台 (Central Platform)**:
    *   **User Gateway**: 处理用户 HTTP 请求，鉴权，路由计算。
    *   **Agent Gateway**: 维护与 Agent 的百万级 WebSocket 长连接。
    *   **职责**: 定价、风控、调度、账单结算。
*   **子平台 (Edge Agent)**:
    *   **部署**: 运行在资源方本地 (PC/Server)。
    *   **职责**: 本地持有真实 API Key，执行请求转发，本地记账。
    *   **约束**: **严格禁止连接第三方中转**，只能连接硬编码的官方 Endpoint (OpenAI/Azure/Anthropic/DeepSeek)。

## 2. 极致原生体验 (Native Experience)

### 2.1 协议透传 (Pass-through)
*   **字节级转发**: 中央平台和 Agent 不解析 HTTP Body (JSON)，直接以二进制流 (Bytes) 形式转发。
*   **兼容性**: 保证 100% 兼容原厂 API 格式 (Input/Output 完全一致)。
*   **流式优化**: Zero-Buffer 策略，收到一个 Chunk 立刻转发，延迟 < 100ms。

### 2.2 连接伪装
*   **IP 来源**: OpenAI 看到的请求来源是 Agent 的 IP (实现地域解锁、防关联)。
*   **Header 处理**: 尽量保留原厂 Header，客户端无感知。

## 3. 安全体系 (Security)

### 3.1 接入安全
*   **反向连接**: Agent 不开启 Listen 端口，防止黑客扫描。
*   **身份验证**:
    *   **mTLS / 挑战-响应**: Agent 使用私钥对随机 Nonce 签名，中央平台验签。
    *   **SSL Pinning**: Agent 硬编码中央平台证书指纹，防止 DNS 劫持/中间人攻击。

### 3.2 资源保护
*   **IP 风控**:
    *   Agent 上报 Proxy 配置。
    *   中央平台通过 Probe 接口主动探测 Agent 真实出口 IP。
    *   限制单 IP 挂载账号数量 (建议 5-10 个)，防止连坐封号。
*   **内容审计**:
    *   中央平台前置敏感词拦截。
    *   日志仅存储 Hash 指纹或脱敏元数据，保护隐私。

## 4. 计费与账本 (Billing & Ledger)

### 4.1 定价模型 (Wholesale)
*   **锚定原价**: 所有计费基于官方标准价 (Price Table 由中央平台下发，带版本号)。
*   **分润公式**: `Agent收入 = 官方原价 * 质量分系数 (Tier Ratio)`。
*   **用户定价**: 中央平台掌握最终定价权 (标准/特惠/溢价区)。

### 4.2 双重账本 (Dual Ledger)
*   **中央账本**: MySQL 集群，负责全局结算。
*   **Agent 账本**: 内置 SQLite (WAL 模式) + 追加式日志 (AOF)。
    *   断电保护：重启可恢复状态。
    *   **Hash 链 (Hash Chain)**: 每一笔交易包含上一笔的 Hash，形成不可篡改的证据链。

### 4.3 异常处理
*   **孤儿单 (Orphan)**: 网络中断导致 Agent 已跑完但中央平台未确认，Agent 发起 `CLAIM` 补单。
*   **取消同步 (Abort)**: 用户断开连接，中央平台发送 `ABORT` 帧，Agent 立即取消 OpenAI 请求，防止浪费。

## 5. 稳定性与运维 (Ops & Stability)

### 5.1 限流体系
*   **中央层**: Redis Lua 脚本，分布式限流 (防止多网关同时派单打爆 Agent)。
*   **Agent 层**: 内存令牌桶 (Token Bucket)，作为最后一道防线。
*   **小白模式**: 自动根据 429 错误调整 RPM/TPM。

### 5.2 关键运维
*   **OTA 升级**: Agent 必须支持自动更新，防止协议变更或证书过期导致全网瘫痪。
*   **数据归档**: 热数据 (MySQL) 定期归档到冷存储 (S3)，防止数据库膨胀。
*   **灾难恢复**: 支持 "Rebuild-from-Edge"，从 Agent 上传的 SQLite 重建中央数据库。

## 6. 遗漏与风险点补充

*   **多模态带宽**: 图片/音频的大流量需支持 WebSocket 分片传输 (Chunking)。
*   **TOS 合规**: 避免宣传“转售 Key”，包装为“企业网关”或“算力管理工具”。
*   **反作弊**: 环路检测 (IP/钱包关联)，防止 Agent 刷单骗取高评级。
*   **上下文探测**: 自动探测 Agent 模型的真实 Context Window (4k vs 128k)。
