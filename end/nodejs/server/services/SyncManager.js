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
     * 启动数据一致性校准任务 (Watchdog)
     */
    startReconciliationJob() {
        const job = async () => {
            if (!this.redis || !this.redis.redis) return;

            try {
                const prefix = 'oauth2:';
                
                // --- 1. 清理：删除 Redis 中有但 DB 中无效的 Key ---

                // Tokens
                const tokenKeys = await this.redis.redis.keys(prefix + 'apikey:*');
                for (const fullKey of tokenKeys) {
                    const tokenKey = fullKey.replace(prefix + 'apikey:', '');
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
                        logger.info(`[Watchdog] Cleaned up invalid token key: ${fullKey}`);
                    }
                }

                // Channels
                const channelKeys = await this.redis.redis.keys(prefix + 'channel:*');
                for (const fullKey of channelKeys) {
                    const channelId = fullKey.replace(prefix + 'channel:', '');
                    if (isNaN(parseInt(channelId))) continue;

                    const [rows] = await db.query("SELECT id, status FROM sys_channels WHERE id = ?", [channelId]);

                    let shouldDelete = false;
                    if (rows.length === 0) {
                        logger.warn(`[Watchdog] Found orphan channel in Redis: ${channelId} (Deleted in DB)`);
                        shouldDelete = true;
                    } else if (rows[0].status === 0) {
                        logger.warn(`[Watchdog] Found disabled channel in Redis: ${channelId} (Status=0)`);
                        shouldDelete = true;
                    }

                    if (shouldDelete) {
                        await this.redis.redis.del(fullKey);
                        logger.info(`[Watchdog] Cleaned up invalid channel key: ${fullKey}`);
                    }
                }

                // --- 2. 补漏：恢复 DB 中有但 Redis 中缺失的 Key ---

                // Active Channels
                const [activeChannels] = await db.query("SELECT * FROM sys_channels WHERE status = 1");
                for (const channel of activeChannels) {
                    const channelKey = `channel:${channel.id}`;
                    const exists = await this.redis.exists(channelKey); // RedisService.exists 自动加前缀
                    if (!exists) {
                        logger.warn(`[Watchdog] Restore missing channel cache: ${channelKey}`);
                        await this.updateChannelCache(channel);
                    }
                }

                // Active Tokens (Non-Vertex)
                const [activeTokens] = await db.query("SELECT * FROM sys_virtual_tokens WHERE status = 1 AND type != 'vertex'");
                for (const token of activeTokens) {
                    const tokenKey = `apikey:${token.token_key}`;
                    const exists = await this.redis.exists(tokenKey);
                    if (!exists) {
                        logger.warn(`[Watchdog] Restore missing token cache: ${tokenKey}`);
                        await this.updateVirtualTokenCache(token);
                    }
                }

            } catch (err) {
                logger.error('[Watchdog] Reconciliation failed:', err);
            }
        };

        // 注册到 JobManager (5分钟一次)
        jobManager.schedule('ReconciliationJob', 5 * 60 * 1000, job);
    }

    /**
     * 更新单个 Channel 的缓存
     */
    async updateChannelCache(channel) {
        try {
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

            if (channel.type !== 'vertex') {
                cacheData.key = channel.credentials;
            }
            
            const redisKey = `channel:${channel.id}`;
            const redisValue = JSON.stringify(cacheData);
            
            try {
                await this.redis.set(redisKey, redisValue);
            } catch (redisErr) {
                logger.error(`[SyncManager] Redis write FAILED for ${redisKey}: ${redisErr.message}`);
            }

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
     * 更新单个 Virtual Token 的缓存
     */
    async updateVirtualTokenCache(token) {
        try {
            if (token.status === 0) {
                if (token.type !== 'vertex') await this.redis.delete(`apikey:${token.token_key}`);
                return;
            }

            const [users] = await db.query("SELECT status FROM sys_users WHERE id = ?", [token.user_id]);
            if (users.length === 0 || users[0].status === 0) {
                if (token.type !== 'vertex') await this.redis.delete(`apikey:${token.token_key}`);
                return;
            }

            const [routes] = await db.query(
                "SELECT channel_id, weight FROM sys_token_routes WHERE virtual_token_id = ?",
                [token.id]
            );

            if (routes.length === 0) {
                if (token.type !== 'vertex') await this.redis.delete(`apikey:${token.token_key}`);
                return;
            }

            const luaData = {
                user_id: token.user_id,
                virtual_token_id: token.id,
                type: token.type,
                token_key: token.token_key,
                routes: routes,
                limits: token.limit_config || {}
            };

            if (token.type !== 'vertex') {
                 let ttl = null;
                 if (token.expires_at) {
                     const diff = Math.floor((new Date(token.expires_at) - new Date()) / 1000);
                     if (diff <= 0) {
                         await this.redis.delete(`apikey:${token.token_key}`);
                         return;
                     }
                     ttl = diff;
                 }
                 
                 if (ttl) {
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