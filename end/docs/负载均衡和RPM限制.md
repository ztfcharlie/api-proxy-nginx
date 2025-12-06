 现状:
   1. Token -> 多个渠道: 一个 Token 可以绑定 Channel A (weight 80), Channel B (weight 20)。
   2. 渠道 -> 多个模型 -> RPM: 每个渠道下的每个模型都有独立的 RPM 限制（例如 Channel A 的 GPT-4 是 100 RPM，Channel B 的 GPT-4 是 10 RPM）。

  目标:
  当用户使用 Token 请求 gpt-4 时，我们需要：
   1. 路由: 按照 80:20 的概率选择渠道。
   2. 限流: 检查被选中的渠道是否已经达到了 RPM 限制。
   3. 故障转移 (Failover): 如果 Channel A 达到了 RPM 限制，应该：
       * Option 1 (硬限流): 直接返回 429 (Rate Limit Exceeded)。
       * Option 2 (软限流/智能路由): 自动降级到 Channel B（即使权重只有 20，但只要它没满）。