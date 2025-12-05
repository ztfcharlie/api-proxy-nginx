const db = require('../config/db').dbPool;
const logger = require('./LoggerService');
const serviceAccountManager = require('./ServiceAccountManager');

class SyncManager {
    constructor() {
        this.redis = null;
    }

    initialize(redisService) {
        this.redis = redisService;
    }

    /**
     * 全量同步：从 MySQL 恢复 Redis 数据
     */
    async performFullSync() {
        if (!this.redis) {
            logger.error('SyncManager: Redis service not initialized');
            return;
        }

        logger.info('Starting full data synchronization (MySQL -> Redis)...');
        const startTime = Date.now();

        try {
            await this.syncChannels();
            await this.syncVirtualTokens();
            
            const duration = Date.now() - startTime;
            logger.info(`Full synchronization completed in ${duration}ms`);
        } catch (error) {
            logger.error('Full synchronization failed:', error);
        }
    }

    /**
     * 同步所有真实渠道配置
     */
    async syncChannels() {
        logger.info('Syncing Channels...');
        try {
            const [channels] = await db.query("SELECT * FROM sys_channels WHERE status = 1");
            
            let count = 0;
            for (const channel of channels) {
                await this.updateChannelCache(channel);
                count++;
            }
            logger.info(`Synced ${count} channels.`);
        } catch (error) {
            logger.error('Error syncing channels:', error);
            throw error;
        }
    }

    /**
     * 同步所有虚拟 Token 配置
     */
    async syncVirtualTokens() {
        logger.info('Syncing Virtual Tokens...');
        try {
            const [tokens] = await db.query("SELECT * FROM sys_virtual_tokens WHERE status = 1");
            
            let count = 0;
            for (const token of tokens) {
                await this.updateVirtualTokenCache(token);
                count++;
            }
            logger.info(`Synced ${count} virtual tokens.`);
        } catch (error) {
            logger.error('Error syncing virtual tokens:', error);
            throw error;
        }
    }

    /**
     * 更新单个 Channel 的缓存
     */
    async updateChannelCache(channel) {
        try {
            const cacheData = {
                id: channel.id,
                type: channel.type,
                name: channel.name,
                extra_config: channel.extra_config, // Azure endpoint 等
                models_config: channel.models_config
            };

            if (channel.type === 'vertex') {
                // Vertex: 触发一次刷新，确保 Access Token 存在
                await serviceAccountManager.refreshSingleChannelToken(channel);
            } else {
                // OpenAI/Azure: credentials 即为 Key
                cacheData.key = channel.credentials;
                
                // 写入 Redis: channel:{id}
                await this.redis.set(`channel:${channel.id}`, JSON.stringify(cacheData));
            }
            
        } catch (error) {
            logger.error(`Failed to cache channel ${channel.id}:`, error);
        }
    }

    /**
     * 更新单个 Virtual Token 的缓存 (供 Lua 直接鉴权使用)
     */
    async updateVirtualTokenCache(token) {
        try {
            // 1. 获取路由规则
            const [routes] = await db.query(
                "SELECT channel_id, weight FROM sys_token_routes WHERE virtual_token_id = ?",
                [token.id]
            );

            if (routes.length === 0) {
                logger.warn(`Virtual Token ${token.id} has no routes, skipping cache.`);
                return;
            }

            // 2. 构建 Lua 所需的 JSON
            const luaData = {
                user_id: token.user_id,
                virtual_token_id: token.id,
                type: token.type,
                token_key: token.token_key, // 方便 Lua 调试
                routes: routes,
                limits: token.limit_config || {}
            };

            // 3. 写入 Redis
            // Key: apikey:{token_key}
            // 仅针对非 Vertex (即 Bearer/API-Key 直接透传模式)
            if (token.type !== 'vertex') {
                 await this.redis.set(`apikey:${token.token_key}`, JSON.stringify(luaData));
            } else {
                // 对于 Vertex，鉴权流程是 JWT -> /oauth2/token -> vtoken
                // 客户端请求 /oauth2/token 时，oauth2_mock.js 会查 MySQL
                // 客户端请求 /v1/projects 时，带的是 vtoken (ya29...)，Lua 查 vtoken:xxx
                // 所以这里不需要存 apikey:xxx
            }

        } catch (error) {
            logger.error(`Failed to cache virtual token ${token.id}:`, error);
        }
    }
}

module.exports = new SyncManager();