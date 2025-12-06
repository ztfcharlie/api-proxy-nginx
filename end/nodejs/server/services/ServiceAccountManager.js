const db = require('../config/db').dbPool;
const { GoogleAuth } = require('google-auth-library');
const logger = require('./LoggerService');
const jobManager = require('./JobManager');

class ServiceAccountManager {
    constructor() {
        this.redis = null;
        this.failures = new Map(); // channelId -> { count, lastTime }
    }

    initialize(redisService) {
        this.redis = redisService;
        logger.info('ServiceAccountManager initialized with Redis service.');
    }

    /**
     * 启动定时刷新任务 (Watchdog 模式: 每 5 分钟检查一次)
     */
    startTokenRefreshJob() {
        const job = async () => {
            await this.refreshAllTokens();
        };
        
        // 每 5 分钟执行一次检查
        jobManager.schedule('TokenRefreshJob', 5 * 60 * 1000, job);
        
        // 启动时立即执行一次检查，防止前5分钟空窗期
        this.refreshAllTokens().catch(err => logger.error('Initial token refresh failed:', err));
    }

    /**
     * 检查并刷新所有 Vertex 渠道 Token
     */
    async refreshAllTokens() {
        try {
            const [channels] = await db.query("SELECT * FROM sys_channels WHERE type = 'vertex' AND status = 1");
            
            for (const channel of channels) {
                try {
                    const key = `real_token:${channel.id}`;
                    const ttl = await this.redis.ttl(key);
                    
                    // TTL < 15分钟 (900秒) 或者 Key 不存在 (-2) 时刷新
                    if (ttl < 900) {
                        if (ttl === -2) {
                            logger.warn(`[TokenWatchdog] Token missing for channel ${channel.id}, refreshing now...`);
                        } else {
                            logger.info(`[TokenWatchdog] Token expiring soon (TTL: ${ttl}s) for channel ${channel.id}, refreshing...`);
                        }
                        await this.refreshSingleChannelToken(channel);
                    }
                } catch (err) {
                    logger.error(`Error checking token for channel ${channel.id}: ${err.message}`);
                }
            }
        } catch (error) {
            logger.error('Error in refreshAllTokens job:', error);
            throw error; 
        }
    }

    /**
     * 刷新单个渠道的 Token (带断路器)
     */
    async refreshSingleChannelToken(channel) {
        // --- Circuit Breaker Check ---
        const failureState = this.failures.get(channel.id);
        if (failureState) {
            const cooldown = 5 * 60 * 1000; // 5 minutes
            const isCoolingDown = (Date.now() - failureState.lastTime) < cooldown;
            
            if (failureState.count >= 3 && isCoolingDown) {
                // 熔断中
                throw new Error(`Channel suspended due to repeated failures (Circuit Open)`);
            }
            
            // 冷却期结束? 允许重试 (Half-Open)
            if (!isCoolingDown && failureState.count >= 3) {
                logger.info(`[CircuitBreaker] Channel ${channel.id} half-open. Retrying...`);
            }
        }

        try {
            let credentials = channel.credentials;
            if (typeof credentials === 'string') {
                credentials = JSON.parse(credentials);
            }

            // 修复私钥格式
            if (credentials.private_key) {
                let key = credentials.private_key;
                key = key.replace(/\\n/g, '\n');
                key = key.trim();
                credentials.private_key = key;
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

            // 3. 存入 Redis (有效期 55 分钟)
            await this.redis.set(`real_token:${channel.id}`, token, 55 * 60);

            // --- Circuit Breaker Reset (Success) ---
            if (this.failures.has(channel.id)) {
                this.failures.delete(channel.id);
                logger.info(`[CircuitBreaker] Channel ${channel.id} recovered. Circuit Closed.`);
            }

            // 4. 更新数据库
            await db.query(
                "UPDATE sys_channels SET current_access_token = ?, last_error = NULL WHERE id = ?",
                [token, channel.id]
            );

            logger.info(`Refreshed token for channel [${channel.id}] ${channel.name}`);

        } catch (error) {
            // --- Circuit Breaker Record (Failure) ---
            const current = this.failures.get(channel.id) || { count: 0, lastTime: 0 };
            this.failures.set(channel.id, {
                count: current.count + 1,
                lastTime: Date.now()
            });
            
            logger.error(`Failed to refresh token for channel [${channel.id}] ${channel.name}: ${error.message}`);
            await db.query(
                "UPDATE sys_channels SET last_error = ? WHERE id = ?",
                [error.message, channel.id]
            );
            throw error;
        }
    }

    /**
     * 获取有效的真实 Token (供 API 调用)
     */
    async getValidToken(channelId) {
        // 1. 先查 Redis
        const token = await this.redis.get(`real_token:${channelId}`);
        if (token) return token;

        // 2. 查不到? 触发一次刷新
        const [channels] = await db.query("SELECT * FROM sys_channels WHERE id = ?", [channelId]);
        if (channels.length === 0) return null;

        try {
            await this.refreshSingleChannelToken(channels[0]);
            // 3. 再次查 Redis
            return await this.redis.get(`real_token:${channelId}`);
        } catch (e) {
            logger.error(`getValidToken failed for channel ${channelId}: ${e.message}`);
            return null;
        }
    }
}

module.exports = new ServiceAccountManager();