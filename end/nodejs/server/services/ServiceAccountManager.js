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
        try {
            let credentials = channel.credentials;
            // 兼容处理：如果是字符串则解析
            if (typeof credentials === 'string') {
                credentials = JSON.parse(credentials);
            }

            // 修复私钥格式 (将字面量 \n 转换为实际换行符)
            if (credentials.private_key) {
                credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
            }

            // 2. 使用 Google Auth Library 获取 Token
            const auth = new GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/cloud-platform']
            });
            
            const client = await auth.getClient();
            const accessTokenResponse = await client.getAccessToken();
            const token = accessTokenResponse.token;

            if (!token) {
                throw new Error('Failed to retrieve token from Google');
            }

            // 3. 存入 Redis (有效期 55 分钟，略小于 Google 的 60 分钟)
            // Key: real_token:{channel_id}
            // 注意：RedisService.set 方法签名是 (key, value, ttl)
            await this.redis.set(`real_token:${channel.id}`, token, 55 * 60);

            // 4. 可选：更新数据库 (用于审计或备用)
            await db.query(
                "UPDATE sys_channels SET current_access_token = ?, last_error = NULL WHERE id = ?",
                [token, channel.id]
            );

            logger.info(`Refreshed token for channel [${channel.id}] ${channel.name}`);

        } catch (error) {
            logger.error(`Failed to refresh token for channel [${channel.id}] ${channel.name}: ${error.message}`);
            // 记录错误到数据库
            await db.query(
                "UPDATE sys_channels SET last_error = ? WHERE id = ?",
                [error.message, channel.id]
            );
        }
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
