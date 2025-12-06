const db = require('../config/db').dbPool;
const logger = require('./LoggerService');
const serviceAccountManager = require('./ServiceAccountManager');
const jobManager = require('./JobManager');

class SyncManager {
    constructor() {
        this.redis = null;
    }

    initialize(redisService) {
        this.redis = redisService;
    }

    /**
     * 启动数据一致性校准任务 (Watchdog)
     */
    startReconciliationJob() {
        const job = async () => {
            if (!this.redis || !this.redis.redis) return;

            // 1. 获取所有 API Keys
            const prefix = 'oauth2:';
            const pattern = prefix + 'apikey:*';
            
            const keys = await this.redis.redis.keys(pattern);
            
            for (const fullKey of keys) {
                const tokenKey = fullKey.replace(prefix + 'apikey:', '');
                
                // 查库验证
                const [rows] = await db.query("SELECT id, status FROM sys_virtual_tokens WHERE token_key = ?", [tokenKey]);
                
                let shouldDelete = false;
                if (rows.length === 0) {
                    logger.warn(`[Watchdog] Found orphan token in Redis: ${tokenKey} (Deleted in DB)`);
                    shouldDelete = true;
                } else if (rows[0].status === 0) {
                    logger.warn(`[Watchdog] Found disabled token in Redis: ${tokenKey} (Status=0)`);
                    shouldDelete = true;
                }
                
                if (shouldDelete) {
                    await this.redis.redis.del(fullKey);
                    logger.info(`[Watchdog] Cleaned up invalid key: ${fullKey}`);
                }
            }
        };

        // 注册到 JobManager (5分钟一次)
        jobManager.schedule('ReconciliationJob', 5 * 60 * 1000, job);
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
            // 如果渠道被禁用，直接删除缓存
            if (channel.status === 0) {
                await this.redis.delete(`channel:${channel.id}`);
                return;
            }

            const cacheData = {
                id: channel.id,
                type: channel.type,
                name: channel.name,
                extra_config: channel.extra_config,
                models_config: channel.models_config
            };

            // 1. 先写入基础配置 (确保 Lua 能查到路由信息)
            if (channel.type !== 'vertex') {
                cacheData.key = channel.credentials;
            }
            
            const redisKey = `channel:${channel.id}`;
            const redisValue = JSON.stringify(cacheData);
            
            logger.info(`[SyncManager] Attempting to write to Redis. Key: ${redisKey}, Value Length: ${redisValue.length}`);
            
            // 无论如何都写入 channel:id
            try {
                const result = await this.redis.set(redisKey, redisValue);
                logger.info(`[SyncManager] Redis write result for ${redisKey}: ${result}`);
            } catch (redisErr) {
                logger.error(`[SyncManager] Redis write FAILED for ${redisKey}: ${redisErr.message}`);
            }

            // 2. 如果是 Vertex，尝试刷新 Token (异步，不阻塞)
            if (channel.type === 'vertex') {
                try {
                    await serviceAccountManager.refreshSingleChannelToken(channel);
                } catch (refreshErr) {
                    logger.error(`[SyncManager] Failed to refresh token for channel ${channel.id}, but config cached. Error: ${refreshErr.message}`);
                }
            }
            
        } catch (error) {
            logger.error(`Failed to cache channel ${channel.id}:`, error);
        }
    }

    /**
     * 更新单个 Virtual Token 的缓存 (级联检查用户状态)
     */
    async updateVirtualTokenCache(token) {
        try {
            // 1. 检查 Token 自身状态
            if (token.status === 0) {
                if (token.type !== 'vertex') await this.redis.delete(`apikey:${token.token_key}`);
                // Vertex vtoken is dynamic
                return;
            }

            // 2. 检查用户状态 (级联)
            const [users] = await db.query("SELECT status FROM sys_users WHERE id = ?", [token.user_id]);
            if (users.length === 0 || users[0].status === 0) {
                if (token.type !== 'vertex') await this.redis.delete(`apikey:${token.token_key}`);
                return;
            }

            // 3. 获取路由规则
            const [routes] = await db.query(
                "SELECT channel_id, weight FROM sys_token_routes WHERE virtual_token_id = ?",
                [token.id]
            );

            if (routes.length === 0) {
                // 没有路由也视为无效
                if (token.type !== 'vertex') await this.redis.delete(`apikey:${token.token_key}`);
                return;
            }

            // 4. 构建 Lua 数据
            const luaData = {
                user_id: token.user_id,
                virtual_token_id: token.id,
                type: token.type,
                token_key: token.token_key, // 方便 Lua 调试
                routes: routes,
                limits: token.limit_config || {}
            };

            // 5. 写入 Redis
            // Key: apikey:{token_key}
            // 仅针对非 Vertex (即 Bearer/API-Key 直接透传模式)
            if (token.type !== 'vertex') {
                 // 检查过期时间
                 let ttl = null;
                 if (token.expires_at) {
                     const diff = Math.floor((new Date(token.expires_at) - new Date()) / 1000);
                     if (diff <= 0) {
                         await this.redis.delete(`apikey:${token.token_key}`); // 已过期
                         return;
                     }
                     ttl = diff;
                 }
                 
                 if (ttl) {
                     // RedisService.set(key, value, ttl)
                     await this.redis.set(`apikey:${token.token_key}`, JSON.stringify(luaData), ttl);
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
            await this.redis.delete(`apikey:${token.token_key}`);
        }
    }
}

module.exports = new SyncManager();
