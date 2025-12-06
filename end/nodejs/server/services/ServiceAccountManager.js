const { GoogleAuth } = require('google-auth-library');
const db = require('../config/db').dbPool;
const logger = require('./LoggerService');

class ServiceAccountManager {
    constructor() {
        // 刷新间隔 (默认 45 分钟，Google Token 有效期通常为 60 分钟)
        this.REFRESH_INTERVAL = 45 * 60 * 1000; 
        this.isRunning = false;
        this.redis = null;
    }

    /**
     * 初始化服务 (注入依赖)
     * @param {Object} redisService - 已初始化的 RedisService 实例
     */
    initialize(redisService) {
        this.redis = redisService;
        logger.info('ServiceAccountManager initialized with Redis service.');
    }

    /**
     * 启动后台刷新任务
     */
    startTokenRefreshJob() {
        if (!this.redis) {
            logger.error('Cannot start token refresh job: Redis service not initialized.');
            return;
        }

        if (this.isRunning) {
            logger.warn('Token refresh job is already running.');
            return;
        }
        this.isRunning = true;
        logger.info('Starting Service Account Token Refresh Job...');

        // 立即执行一次
        this.refreshAllTokens();

        // 设置定时任务
        setInterval(() => {
            this.refreshAllTokens();
        }, this.REFRESH_INTERVAL);
    }

    /**
     * 刷新所有 Vertex 类型渠道的 Token
     */
    async refreshAllTokens() {
        logger.info('Scanning for Vertex channels to refresh tokens...');
        try {
            // 1. 获取所有启用的 Vertex 渠道
            const [channels] = await db.query(
                "SELECT id, name, credentials FROM sys_channels WHERE type = 'vertex' AND status = 1"
            );

            logger.info(`Found ${channels.length} Vertex channels.`);

            for (const channel of channels) {
                await this.refreshSingleChannelToken(channel);
            }
        } catch (error) {
            logger.error(`Error in global token refresh: ${error.message}`);
        }
    }

    /**
     * 刷新单个渠道的 Token 并存入 Redis
     */
    async refreshSingleChannelToken(channel) {
        logger.warn(`[ServiceAccountManager] Token refresh is TEMPORARILY DISABLED for debugging. Channel: ${channel.id}`);
        return; 

        /*
        try {
            let credentials = channel.credentials;
            // ... (original code) ...
        } catch (error) {
            // ...
        }
        */
    }

    /**
     * 获取有效的真实 Token (优先从 Redis，没有则现场请求)
     * @param {number} channelId 
     */
    async getValidToken(channelId) {
        if (!this.redis) {
            throw new Error('Redis service not initialized');
        }

        // 1. 尝试从 Redis 获取
        const cachedToken = await this.redis.get(`real_token:${channelId}`);
        if (cachedToken) {
            return cachedToken;
        }

        logger.warn(`Token cache miss for channel ${channelId}, fetching immediately...`);

        // 2. 缓存未命中（可能刚启动或过期），现场请求
        const [rows] = await db.query(
            "SELECT id, name, credentials FROM sys_channels WHERE id = ? AND status = 1",
            [channelId]
        );

        if (rows.length === 0) {
            throw new Error(`Channel ${channelId} not found or disabled`);
        }

        const channel = rows[0];
        
        // 复用刷新逻辑
        await this.refreshSingleChannelToken(channel);
        
        // 再次读取
        return await this.redis.get(`real_token:${channelId}`);
    }
}

module.exports = new ServiceAccountManager();
