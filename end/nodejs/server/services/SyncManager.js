const logger = require('./LoggerService');
const jobManager = require('./JobManager');

class SyncManager {
    constructor() {
        this.redis = null;
    }

    initialize(redisService) {
        this.redis = redisService;
        jobManager.setRedis(redisService);
    }

    /**
     * 触发 Go Service 进行全量同步
     * 所有的缓存更新现在统一由 Go Service 负责，确保数据结构一致性。
     */
    async triggerGoSync() {
        if (!this.redis) return;
        try {
            // 使用 RedisService 的 publish 方法 (如果封装了) 或者直接用 ioredis
            // RedisService.publish 可能会加前缀，我们需要确认频道名。
            // Go 监听的是 "oauth2:cmd:job:trigger" (在 main.go 中定义)
            // 假设 RedisService 的 keyPrefix 是 "oauth2:"，那么我们只需要 publish "cmd:job:trigger"?
            // 不，ioredis 的 publish 不受 keyPrefix 影响。
            // 让我们直接用 this.redis.redis (原始客户端)
            
            const channel = 'oauth2:cmd:job:trigger';
            const message = 'db_sync_job';
            
            await this.redis.redis.publish(channel, message);
            logger.info('[SyncManager] Triggered Go Service sync.');
        } catch (error) {
            logger.error('[SyncManager] Failed to trigger sync:', error);
        }
    }

    // --- 兼容旧接口，全部指向 triggerGoSync ---

    async performFullSync() {
        return this.triggerGoSync();
    }

    async syncModelPrices() {
        return this.triggerGoSync();
    }

    async updateModelCache() {
        return this.triggerGoSync();
    }

    async syncChannels() {
        return this.triggerGoSync();
    }

    async syncVirtualTokens() {
        return this.triggerGoSync();
    }

    async updateChannelCache(channel) {
        // 哪怕只是更新一个 Channel，也触发全量 Sync (Go 的 Sync 很快)
        // 或者未来可以让 Go 支持增量 Sync 消息
        return this.triggerGoSync();
    }

    async updateVirtualTokenCache(token) {
        return this.triggerGoSync();
    }

    async deleteTokenCache(token) {
        return this.triggerGoSync();
    }

    // 废弃的方法
    startReconciliationJob() {
        // No-op
    }
}

module.exports = new SyncManager();