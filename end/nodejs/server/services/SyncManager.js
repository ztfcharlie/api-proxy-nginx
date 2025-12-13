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
            const channel = 'oauth2:cmd:job:trigger';
            const message = 'db_sync_job';
            
            // 使用底层 ioredis 实例发送
            if (this.redis.redis) {
                await this.redis.redis.publish(channel, message);
                logger.info('[SyncManager] Triggered Go Service sync via Pub/Sub.');
            } else {
                logger.error('[SyncManager] Redis client not ready.');
            }
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