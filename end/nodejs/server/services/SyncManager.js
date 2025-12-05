const db = require('../config/db').dbPool;
const logger = require('./LoggerService');
const redis = require('./RedisService'); // 注意：这里需要在 app.js 中注入实例，或者改为单例
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
     * 通常在服务启动时调用
     */
    async performFullSync() {
        if (!this.redis) {
            logger.error('SyncManager: Redis service not initialized');
            return;
        }

        logger.info('Starting full data synchronization (MySQL -> Redis)...');
        const startTime = Date.now();

        try {
            // 1. 同步渠道 (Channels)
            await this.syncChannels();

            // 2. 同步虚拟 Token (Virtual Tokens)
            await this.syncVirtualTokens();

            // 3. 同步 Vertex 的 OAuth2 映射 (如果有持久化存储)
            // 注意：vtoken 是临时的，通常不需要恢复，因为客户端会重新请求 token。
            // 但如果我们在 MySQL 存了 vtoken 映射记录（目前设计没存），则需要恢复。
            // 目前的设计是 vtoken 仅存在 Redis，重启丢失也没关系，客户端重新交换即可。
            
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
            // 获取所有启用的渠道
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
            // 获取所有启用的 Virtual Tokens
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
     * 更新单个 Channel 的缓存 (供 SyncManager 和 Admin API 使用)
     */
    async updateChannelCache(channel) {
        try {
            // 1. 构建基础数据
            const cacheData = {
                id: channel.id,
                type: channel.type,
                name: channel.name,
                base_url: channel.base_url, // 如果 schema v3 改为 extra_config，这里需调整
                extra_config: channel.extra_config,
                models_config: channel.models_config
            };

            // 2. 特殊处理：如果是 API Key 类型 (OpenAI/Azure)，直接放入 credentials
            if (channel.type !== 'vertex') {
                // 假设 credentials 存的是纯字符串的 key
                // 如果是 Azure，可能需要从 extra_config 拿 endpoint
                cacheData.key = channel.credentials;
            } else {
                // Vertex 类型：触发一次刷新，确保 Access Token 存在
                // ServiceAccountManager 会自己写 Redis (real_token:id)
                // 所以这里不需要把 JSON 写入 channel:id，只需要基础信息
                await serviceAccountManager.refreshSingleChannelToken(channel);
            }

            // 3. 写入 Redis
            // Key: channel:{id}
            await this.redis.set(`channel:${channel.id}`, JSON.stringify(cacheData));
            
        } catch (error) {
            logger.error(`Failed to cache channel ${channel.id}:`, error);
        }
    }

    /**
     * 更新单个 Virtual Token 的缓存
     */
    async updateVirtualTokenCache(token) {
        try {
            // 1. 获取路由规则
            const [routes] = await db.query(
                "SELECT channel_id, weight FROM sys_token_routes WHERE virtual_token_id = ?",
                [token.id]
            );

            if (routes.length === 0) {
                logger.warn(`Virtual Token ${token.id} (${token.token_key}) has no routes, skipping cache.`);
                return;
            }

            // 2. 构建 Lua 所需的 JSON
            const luaData = {
                user_id: token.user_id,
                virtual_token_id: token.id,
                type: token.type,
                routes: routes,
                limits: token.limit_config || {} // 避免 null
            };

            // 3. 写入 Redis
            // Key: apikey:{token_key}
            // 注意：如果是 Vertex，token_key 可能是 email 或其他标识，
            // 但 Vertex 的交换流程是查 sys_virtual_keys 表（Node.js查），
            // 所以这里主要针对 OpenAI/Azure 这种直接透传 Key 的场景。
            
            // 如果是 Vertex 类型，通常不需要 apikey:xxx 缓存，因为它是通过 oauth2/token 端点交换的。
            // 但为了统一，或者是为了支持 Vertex 的 API Key 模式（如果有），可以存。
            
            if (token.type !== 'vertex') {
                 await this.redis.set(`apikey:${token.token_key}`, JSON.stringify(luaData));
            } else {
                // 对于 Vertex，我们需要确保 public_key 等信息在 DB 里，
                // Node.js 的 oauth2_mock.js 是直接查 DB 的，所以这里不需要 Redis 缓存。
                // 除非我们想优化 oauth2_mock.js 也查 Redis。
            }

        } catch (error) {
            logger.error(`Failed to cache virtual token ${token.id}:`, error);
        }
    }
}

module.exports = new SyncManager();