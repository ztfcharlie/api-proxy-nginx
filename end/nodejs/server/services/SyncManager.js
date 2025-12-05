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
            // 如果渠道被禁用，直接删除缓存，让 Lua 查不到（或者查不到报错）
            if (channel.status === 0) {
                await this.redis.del(`channel:${channel.id}`);
                return;
            }

            const cacheData = {
                id: channel.id,
                type: channel.type,
                name: channel.name,
                extra_config: channel.extra_config,
                models_config: channel.models_config
            };

            if (channel.type === 'vertex') {
                await serviceAccountManager.refreshSingleChannelToken(channel);
            } else {
                cacheData.key = channel.credentials;
                await this.redis.set(`channel:${channel.id}`, JSON.stringify(cacheData));
            }
            
        } catch (error) {
            logger.error(`Failed to cache channel ${channel.id}:`, error);
        }
    }

    /**
     * 删除 Channel 缓存
     */
    async deleteChannelCache(channel) {
        await this.redis.del(`channel:${channel.id}`);
    }

    /**
     * 更新单个 Virtual Token 的缓存 (级联检查用户状态)
     */
    async updateVirtualTokenCache(token) {
        try {
            // 1. 检查 Token 自身状态
            if (token.status === 0) {
                if (token.type !== 'vertex') await this.redis.del(`apikey:${token.token_key}`);
                // Vertex vtoken is dynamic, but we can block issuance in oauth2_mock
                return;
            }

            // 2. 检查用户状态 (级联)
            const [users] = await db.query("SELECT status FROM sys_users WHERE id = ?", [token.user_id]);
            if (users.length === 0 || users[0].status === 0) {
                if (token.type !== 'vertex') await this.redis.del(`apikey:${token.token_key}`);
                return;
            }

            // 3. 获取路由规则
            const [routes] = await db.query(
                "SELECT channel_id, weight FROM sys_token_routes WHERE virtual_token_id = ?",
                [token.id]
            );

            if (routes.length === 0) {
                // 没有路由也视为无效
                if (token.type !== 'vertex') await this.redis.del(`apikey:${token.token_key}`);
                return;
            }

            // 4. 构建 Lua 数据
            const luaData = {
                user_id: token.user_id,
                virtual_token_id: token.id,
                type: token.type,
                token_key: token.token_key,
                routes: routes,
                limits: token.limit_config || {}
            };

            // 5. 写入 Redis
            if (token.type !== 'vertex') {
                 // 检查过期时间
                 let ttl = null;
                 if (token.expires_at) {
                     const diff = Math.floor((new Date(token.expires_at) - new Date()) / 1000);
                     if (diff <= 0) {
                         await this.redis.del(`apikey:${token.token_key}`); // 已过期
                         return;
                     }
                     ttl = diff;
                 }
                 
                 if (ttl) {
                     await this.redis.setex(`apikey:${token.token_key}`, ttl, JSON.stringify(luaData));
                 } else {
                     await this.redis.set(`apikey:${token.token_key}`, JSON.stringify(luaData));
                 }
            }

        } catch (error) {
            logger.error(`Failed to cache virtual token ${token.id}:`, error);
        }
    }

    /**
     * 删除 Token 缓存
     */
    async deleteTokenCache(token) {
        if (token.type !== 'vertex') {
            await this.redis.del(`apikey:${token.token_key}`);
        }
    }
}

module.exports = new SyncManager();