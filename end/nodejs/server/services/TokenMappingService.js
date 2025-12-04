const RedisService = require('./RedisService');
const LoggerService = require('./LoggerService');

class TokenMappingService {
    constructor(redisService) {
        this.redis = redisService;
        this.mapPrefix = 'token_map:';
        this.userTokensPrefix = 'user_tokens:';
        this.defaultTTL = 3600; // 1小时
    }

    /**
     * 创建access_token到user_id的映射
     */
    async createTokenMapping(accessToken, userId, expiresIn = null) {
        try {
            const ttl = expiresIn || this.defaultTTL;
            const timestamp = Date.now();
            const expireAt = timestamp + (ttl * 1000);

            // 存储映射关系
            const mappingData = {
                user_id: userId,
                created_at: timestamp,
                expire_at: expireAt
            };

            // 设置Redis key
            const key = `${this.mapPrefix}${accessToken}`;
            await this.redis.set(key, JSON.stringify(mappingData), ttl);

            // 同时维护用户的token列表（用于清理）
            await this.addUserToken(userId, accessToken);

            LoggerService.info('Token mapping created', {
                access_token: accessToken.substring(0, 10) + '...',
                user_id: userId,
                ttl: ttl
            });

            return true;
        } catch (error) {
            LoggerService.error('Failed to create token mapping:', error);
            return false;
        }
    }

    /**
     * 根据access_token获取用户信息
     */
    async getUserByToken(accessToken) {
        try {
            const key = `${this.mapPrefix}${accessToken}`;
            const mappingData = await this.redis.get(key);

            if (!mappingData) {
                return null;
            }

            const mapping = JSON.parse(mappingData);
            const currentTime = Date.now();

            // 检查是否过期
            if (currentTime > mapping.expire_at) {
                await this.deleteTokenMapping(accessToken);
                LoggerService.warn('Token expired and removed from mapping', {
                    access_token: accessToken.substring(0, 10) + '...'
                });
                return null;
            }

            return {
                user_id: mapping.user_id,
                created_at: mapping.created_at,
                expire_at: mapping.expire_at
            };

        } catch (error) {
            LoggerService.error('Failed to get user by token:', error);
            return null;
        }
    }

    /**
     * 删除token映射
     */
    async deleteTokenMapping(accessToken) {
        try {
            const key = `${this.mapPrefix}${accessToken}`;
            const mappingData = await this.redis.get(key);

            if (mappingData) {
                const mapping = JSON.parse(mappingData);
                await this.redis.delete(key);
                await this.removeUserToken(mapping.user_id, accessToken);
            }

            return true;
        } catch (error) {
            LoggerService.error('Failed to delete token mapping:', error);
            return false;
        }
    }

    /**
     * 验证token是否有效
     */
    async validateToken(accessToken) {
        try {
            const userInfo = await this.getUserByToken(accessToken);
            return userInfo !== null;
        } catch (error) {
            LoggerService.error('Failed to validate token:', error);
            return false;
        }
    }

    /**
     * 为用户添加token到列表
     */
    async addUserToken(userId, accessToken) {
        try {
            const key = `${this.userTokensPrefix}${userId}`;
            const timestamp = Date.now();

            // 获取现有token列表
            const existingData = await this.redis.get(key);
            let tokenList = existingData ? JSON.parse(existingData) : [];

            // 添加新token到列表
            tokenList.push({
                access_token: accessToken,
                created_at: timestamp
            });

            // 限制列表长度，避免无限增长
            if (tokenList.length > 100) {
                // 删除最旧的token
                const oldToken = tokenList.shift();
                await this.deleteTokenMapping(oldToken.access_token);
                LoggerService.info('Removed old token due to limit', {
                    removed_token: oldToken.access_token.substring(0, 10) + '...'
                });
            }

            await this.redis.set(key, JSON.stringify(tokenList));
            return true;

        } catch (error) {
            LoggerService.error('Failed to add user token:', error);
            return false;
        }
    }

    /**
     * 从用户token列表中移除token
     */
    async removeUserToken(userId, accessToken) {
        try {
            const key = `${this.userTokensPrefix}${userId}`;
            const existingData = await this.redis.get(key);

            if (!existingData) {
                return false;
            }

            let tokenList = JSON.parse(existingData);
            const originalLength = tokenList.length;

            // 从列表中移除指定token
            tokenList = tokenList.filter(token => token.access_token !== accessToken);

            if (tokenList.length !== originalLength) {
                await this.redis.set(key, JSON.stringify(tokenList));
                return true;
            }

            return false;

        } catch (error) {
            LoggerService.error('Failed to remove user token:', error);
            return false;
        }
    }

    /**
     * 获取用户的所有有效token
     */
    async getUserTokens(userId) {
        try {
            const key = `${this.userTokensPrefix}${userId}`;
            const tokenListData = await this.redis.get(key);

            if (!tokenListData) {
                return [];
            }

            let tokenList = JSON.parse(tokenListData);
            const validTokens = [];

            // 验证每个token的有效性
            for (const tokenInfo of tokenList) {
                const userInfo = await this.getUserByToken(tokenInfo.access_token);
                if (userInfo) {
                    validTokens.push({
                        access_token: tokenInfo.access_token,
                        created_at: tokenInfo.created_at,
                        expire_at: userInfo.expire_at
                    });
                } else {
                    // 清理无效的token引用
                    await this.removeUserToken(userId, tokenInfo.access_token);
                }
            }

            return validTokens;

        } catch (error) {
            LoggerService.error('Failed to get user tokens:', error);
            return [];
        }
    }

    /**
     * 清理过期的token映射
     */
    async cleanupExpiredTokens() {
        try {
            // 使用Redis的SCAN命令批量检查过期token
            const pattern = `${this.mapPrefix}*`;
            const stream = this.redis.redis.scanStream({
                match: pattern,
                count: 100
            });

            let cleanedCount = 0;

            for await (const [key, field] of stream) {
                try {
                    const mappingData = await this.redis.redis.get(key);
                    if (mappingData) {
                        const mapping = JSON.parse(mappingData);
                        const currentTime = Date.now();

                        if (currentTime > mapping.expire_at) {
                            await this.redis.redis.del(key);
                            cleanedCount++;
                        }
                    }
                } catch (error) {
                    LoggerService.error('Error checking token:', error);
                }
            }

            if (cleanedCount > 0) {
                LoggerService.info('Cleaned up expired tokens', {
                    count: cleanedCount
                });
            }

            return cleanedCount;

        } catch (error) {
            LoggerService.error('Failed to cleanup expired tokens:', error);
            return 0;
        }
    }

    /**
     * 获取Token映射统计信息
     */
    async getMappingStats() {
        try {
            const pattern = `${this.mapPrefix}*`;
            const stream = this.redis.redis.scanStream({
                match: pattern,
                count: 10000
            });

            let totalTokens = 0;
            let validTokens = 0;
            let expiredTokens = 0;
            const currentTime = Date.now();

            for await (const [key, field] of stream) {
                try {
                    totalTokens++;
                    const mappingData = await this.redis.redis.get(key);

                    if (mappingData) {
                        const mapping = JSON.parse(mappingData);
                        if (currentTime <= mapping.expire_at) {
                            validTokens++;
                        } else {
                            expiredTokens++;
                        }
                    }
                } catch (error) {
                    LoggerService.error('Error analyzing token:', error);
                }
            }

            return {
                total: totalTokens,
                valid: validTokens,
                expired: expiredTokens,
                valid_rate: totalTokens > 0 ? (validTokens / totalTokens * 100).toFixed(2) + '%' : '0%'
            };

        } catch (error) {
            LoggerService.error('Failed to get mapping stats:', error);
            return { total: 0, valid: 0, expired: 0, valid_rate: '0%' };
        }
    }
}

module.exports = TokenMappingService;