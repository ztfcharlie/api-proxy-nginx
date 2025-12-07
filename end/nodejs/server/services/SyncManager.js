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
            await this.syncModelPrices(); // [Added]
            
            const duration = Date.now() - startTime;
            logger.info(`Full synchronization completed in ${duration}ms`);
        } catch (error) {
            logger.error('Full synchronization failed:', error);
        }
    }

    /**
     * 同步所有模型价格配置
     */
    async syncModelPrices() {
        logger.info('Syncing Model Prices...');
        try {
            const [models] = await db.query("SELECT model_id, type, input_price, output_price, request_price FROM sys_models WHERE status = 1");
            
            const priceMap = {};
            for (const m of models) {
                // 统一单位：假设数据库存的是每 1k 或 1M 的价格，这里原样存入
                // Go 端会统一除以 1000 或 1000000
                priceMap[m.model_id] = {
                    type: m.type === 2 ? 'request' : 'token', // 假设 db type 1=token, 2=request
                    input: parseFloat(m.input_price || 0),
                    output: parseFloat(m.output_price || 0),
                    price: parseFloat(m.request_price || 0)
                };
            }
            
            // 使用 set 覆盖，而不是 hash set，因为 Go 读取 json 更方便
            await this.redis.set('model_prices', JSON.stringify(priceMap));
            logger.info(`Synced ${models.length} model prices.`);
        } catch (error) {
            logger.error('Error syncing model prices:', error);
        }
    }

    /**
     * 触发模型缓存更新 (当管理后台修改模型时调用)
     */
    async updateModelCache() {
        return this.syncModelPrices();
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
        logger.info('[DEPRECATED] Node.js ReconciliationJob is disabled. This task is now handled by the Go Core Service.');
        /*
        const job = async () => {
            if (!this.redis || !this.redis.redis) return;

            try {
                const prefix = 'oauth2:';
                
                // --- 1. 清理：删除 Redis 中有但 DB 中无效的 Key ---
        // ... (rest of the logic) ...
        // 注册到 JobManager (5分钟一次)
        jobManager.schedule(
            'ReconciliationJob', 
            5 * 60 * 1000, 
            job, 
            'Syncs DB & Redis state: Cleans orphan keys and restores missing cache.'
        );
        */
    }

    /**
     * 更新单个 Channel 的缓存
     */
    async updateChannelCache(channel) {
        try {
            // 1. 基础处理 (和之前一样)
            if (channel.status === 0) {
                await this.redis.delete(`channel:${channel.id}`);
                // 级联更新：通知所有 Token 这个渠道挂了 (虽然只是删了缓存，但最好更新 Token 路由表)
                await this.updateTokensByChannelId(channel.id);
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

            // 2. Vertex 刷新 (保持不变)
            if (channel.type === 'vertex') {
                try {
                    await serviceAccountManager.refreshSingleChannelToken(channel);
                } catch (refreshErr) {
                    logger.error(`[SyncManager] Failed to refresh token for channel ${channel.id}, but config cached.`);
                }
            }

            // 3. [关键新增] 级联更新所有引用了该 Channel 的 Token
            // 因为 Token 的缓存里现在包含了 Channel 的 RPM 配置
            await this.updateTokensByChannelId(channel.id);
            
        } catch (error) {
            logger.error(`Failed to cache channel ${channel.id}:`, error);
        }
    }

    /**
     * 级联更新：当 Channel 变更时，刷新所有引用它的 Token
     */
    async updateTokensByChannelId(channelId) {
        try {
            // 查出所有引用了该渠道的有效 Token
            const query = `
                SELECT t.* 
                FROM sys_virtual_tokens t
                JOIN sys_token_routes r ON t.id = r.virtual_token_id
                WHERE r.channel_id = ? AND t.status = 1
            `;
            const [tokens] = await db.query(query, [channelId]);
            
            if (tokens.length > 0) {
                logger.info(`[SyncManager] Channel ${channelId} changed. Updating ${tokens.length} dependent tokens.`);
                for (const token of tokens) {
                    await this.updateVirtualTokenCache(token);
                }
            }
        } catch (e) {
            logger.error(`[SyncManager] Failed to cascade update tokens for channel ${channelId}:`, e);
        }
    }

    /**
     * 更新单个 Virtual Token 的缓存 (数据异构版)
     */
    async updateVirtualTokenCache(token) {
        try {
            // ... (状态检查逻辑保持不变) ...
            if (token.status === 0) {
                if (token.type !== 'vertex') await this.redis.delete(`apikey:${token.token_key}`);
                return;
            }

            const [users] = await db.query("SELECT status FROM sys_users WHERE id = ?", [token.user_id]);
            if (users.length === 0 || users[0].status === 0) {
                if (token.type !== 'vertex') {
                    await this.redis.delete(`apikey:${token.token_key}`);
                } else {
                    // Vertex: 通过反向索引清理所有活动的 Access Token
                    // Key: user_tokens:{user_id}
                    const userTokensKey = `user_tokens:${token.user_id}`;
                    // RedisService.redis 是 ioredis 实例 (无前缀配置), 但我们在 RedisService.js 里把 keyPrefix 删了
                    // 等等，RedisService 的 config 里还有 keyPrefix ('oauth2:')，只是没传给 ioredis。
                    // 意味着 RedisService 的方法会自动加。但 ioredis 直接调用不会。
                    
                    // 获取前缀
                    const prefix = this.redis.config.keyPrefix; 
                    
                    try {
                        // 使用 ioredis 直接操作 (因为 RedisService 没有 smembers)
                        const fullSetKey = prefix + userTokensKey;
                        const vtokens = await this.redis.redis.smembers(fullSetKey);
                        
                        if (vtokens.length > 0) {
                            const pipeline = this.redis.redis.pipeline();
                            // 批量删除 vtoken
                            for (const vt of vtokens) {
                                pipeline.del(prefix + `vtoken:${vt}`);
                            }
                            // 删除索引本身
                            pipeline.del(fullSetKey);
                            
                            await pipeline.exec();
                            logger.info(`[SyncManager] Revoked ${vtokens.length} active Vertex tokens for disabled user ${token.user_id}`);
                        }
                    } catch (err) {
                        logger.error(`[SyncManager] Failed to revoke Vertex tokens: ${err.message}`);
                    }
                }
                return;
            }

            // [关键修改] 查询路由时，联查 Channel 信息
            const [routes] = await db.query(`
                SELECT r.channel_id, r.weight, c.type as channel_type, c.models_config, c.status as channel_status
                FROM sys_token_routes r
                JOIN sys_channels c ON r.channel_id = c.id
                WHERE r.virtual_token_id = ?
            `, [token.id]);

            if (routes.length === 0) {
                if (token.type !== 'vertex') await this.redis.delete(`apikey:${token.token_key}`);
                return;
            }

            // 处理路由数据
            const processedRoutes = routes
                .filter(r => r.channel_status === 1) // 只包含活跃渠道
                .map(r => {
                    let modelsConfig = {};
                    try {
                        // 解析 JSON 配置
                        modelsConfig = typeof r.models_config === 'string' ? JSON.parse(r.models_config) : r.models_config;
                    } catch (e) {}

                    return {
                        channel_id: r.channel_id,
                        weight: r.weight,
                        type: r.channel_type, // 给 Lua 用来判断是否需要 Real Token
                        models_config: modelsConfig // 包含 RPM
                    };
                });

            if (processedRoutes.length === 0) {
                // 所有渠道都挂了
                logger.warn(`Token ${token.id} has routes but all channels are disabled.`);
                // 依然可以写入，但 routes 为空，Lua 处理时会报错或 503
            }

            const luaData = {
                user_id: token.user_id,
                virtual_token_id: token.id,
                type: token.type,
                token_key: token.token_key,
                routes: processedRoutes, // 注入了 RPM 的路由表
                limits: token.limit_config || {}
            };

            // 写入 Redis (保持不变)
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