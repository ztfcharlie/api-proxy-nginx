const LoggerService = require('./LoggerService');
const RedisService = require('./RedisService');

/**
 * 缓存服务
 * 提供内存缓存和Redis缓存的多层缓存支持
 */
class CacheService {
    constructor() {
        this.logger = LoggerService.getInstance();
        this.redisService = new RedisService();

        // 内存缓存
        this.memoryCache = new Map();

        // 配置
        this.config = {
            // 内存缓存配置
            memoryCacheSize: parseInt(process.env.MEMORY_CACHE_SIZE) || 1000,
            memoryCacheTTL: parseInt(process.env.MEMORY_CACHE_TTL) || 300, // 5分钟

            // Redis缓存配置
            redisCacheTTL: parseInt(process.env.REDIS_CACHE_TTL) || 3600, // 1小时

            // 默认TTL
            defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 1800, // 30分钟

            // 缓存键前缀
            keyPrefix: process.env.CACHE_KEY_PREFIX || 'oauth2_cache:',

            // 是否启用内存缓存
            enableMemoryCache: process.env.ENABLE_MEMORY_CACHE !== 'false',

            // 是否启用Redis缓存
            enableRedisCache: process.env.ENABLE_REDIS_CACHE !== 'false'
        };

        // 内存缓存定时清理
        this.cleanupInterval = null;

        // 统计信息
        this.stats = {
            hits: 0,
            misses: 0,
            memoryHits: 0,
            redisHits: 0,
            errors: 0,
            memorySize: 0
        };
    }

    /**
     * 初始化缓存服务
     */
    async initialize() {
        try {
            this.logger.info('初始化缓存服务...', {
                config: {
                    memoryCacheSize: this.config.memoryCacheSize,
                    memoryCacheTTL: this.config.memoryCacheTTL,
                    redisCacheTTL: this.config.redisCacheTTL,
                    enableMemoryCache: this.config.enableMemoryCache,
                    enableRedisCache: this.config.enableRedisCache
                }
            });

            // 初始化Redis服务
            if (this.config.enableRedisCache) {
                await this.redisService.initialize();
                this.logger.info('Redis缓存服务已启用');
            } else {
                this.logger.info('Redis缓存服务已禁用');
            }

            // 启动内存缓存清理定时器
            if (this.config.enableMemoryCache) {
                this.startMemoryCacheCleanup();
                this.logger.info('内存缓存服务已启用');
            } else {
                this.logger.info('内存缓存服务已禁用');
            }

            this.logger.info('缓存服务初始化完成');
        } catch (error) {
            this.logger.error('缓存服务初始化失败:', error);
            throw error;
        }
    }

    /**
     * 获取缓存值
     * @param {string} key 缓存键
     * @returns {Promise<any>} 缓存值
     */
    async get(key) {
        try {
            const cacheKey = this.buildKey(key);
            let value = null;

            // 首先尝试内存缓存
            if (this.config.enableMemoryCache) {
                const memoryValue = this.getFromMemory(cacheKey);
                if (memoryValue !== null) {
                    this.stats.memoryHits++;
                    this.stats.hits++;
                    return memoryValue;
                }
            }

            // 然后尝试Redis缓存
            if (this.config.enableRedisCache && this.redisService.isConnected) {
                try {
                    const redisValue = await this.redisService.get(cacheKey);
                    if (redisValue !== null) {
                        const parsedValue = JSON.parse(redisValue);

                        // 将Redis缓存的数据同步到内存缓存
                        if (this.config.enableMemoryCache) {
                            this.setToMemory(cacheKey, parsedValue, this.config.memoryCacheTTL);
                        }

                        this.stats.redisHits++;
                        this.stats.hits++;
                        return parsedValue;
                    }
                } catch (redisError) {
                    this.logger.error('Redis缓存读取失败:', redisError);
                    this.stats.errors++;
                }
            }

            this.stats.misses++;
            return null;
        } catch (error) {
            this.logger.error('缓存读取失败:', { key, error: error.message });
            this.stats.errors++;
            return null;
        }
    }

    /**
     * 设置缓存值
     * @param {string} key 缓存键
     * @param {any} value 缓存值
     * @param {number} ttl 过期时间（秒），默认使用配置的默认TTL
     * @returns {Promise<boolean>} 是否设置成功
     */
    async set(key, value, ttl = null) {
        try {
            const cacheKey = this.buildKey(key);
            const actualTTL = ttl || this.config.defaultTTL;
            const stringValue = JSON.stringify(value);

            // 设置到内存缓存
            if (this.config.enableMemoryCache) {
                this.setToMemory(cacheKey, value, Math.min(actualTTL, this.config.memoryCacheTTL));
            }

            // 设置到Redis缓存
            if (this.config.enableRedisCache && this.redisService.isConnected) {
                try {
                    const success = await this.redisService.setex(cacheKey, actualTTL, stringValue);
                    if (!success) {
                        this.logger.warn('Redis缓存设置失败:', { key: cacheKey });
                    }
                } catch (redisError) {
                    this.logger.error('Redis缓存写入失败:', redisError);
                    this.stats.errors++;
                }
            }

            return true;
        } catch (error) {
            this.logger.error('缓存设置失败:', { key, error: error.message });
            this.stats.errors++;
            return false;
        }
    }

    /**
     * 删除缓存
     * @param {string} key 缓存键
     * @returns {Promise<boolean>} 是否删除成功
     */
    async delete(key) {
        try {
            const cacheKey = this.buildKey(key);

            // 从内存缓存删除
            if (this.config.enableMemoryCache) {
                this.memoryCache.delete(cacheKey);
            }

            // 从Redis缓存删除
            if (this.config.enableRedisCache && this.redisService.isConnected) {
                try {
                    await this.redisService.del(cacheKey);
                } catch (redisError) {
                    this.logger.error('Redis缓存删除失败:', redisError);
                    this.stats.errors++;
                }
            }

            return true;
        } catch (error) {
            this.logger.error('缓存删除失败:', { key, error: error.message });
            this.stats.errors++;
            return false;
        }
    }

    /**
     * 检查缓存是否存在
     * @param {string} key 缓存键
     * @returns {Promise<boolean>} 是否存在
     */
    async exists(key) {
        try {
            const cacheKey = this.buildKey(key);

            // 检查内存缓存
            if (this.config.enableMemoryCache && this.memoryCache.has(cacheKey)) {
                const item = this.memoryCache.get(cacheKey);
                if (item.expiresAt > Date.now()) {
                    return true;
                } else {
                    this.memoryCache.delete(cacheKey);
                }
            }

            // 检查Redis缓存
            if (this.config.enableRedisCache && this.redisService.isConnected) {
                try {
                    return await this.redisService.exists(cacheKey);
                } catch (redisError) {
                    this.logger.error('Redis缓存存在性检查失败:', redisError);
                    this.stats.errors++;
                }
            }

            return false;
        } catch (error) {
            this.logger.error('缓存存在性检查失败:', { key, error: error.message });
            this.stats.errors++;
            return false;
        }
    }

    /**
     * 批量获取缓存
     * @param {string[]} keys 缓存键数组
     * @returns {Promise<Object>} 键值对对象
     */
    async mget(keys) {
        try {
            const result = {};

            for (const key of keys) {
                const value = await this.get(key);
                if (value !== null) {
                    result[key] = value;
                }
            }

            return result;
        } catch (error) {
            this.logger.error('批量缓存获取失败:', { keys, error: error.message });
            this.stats.errors++;
            return {};
        }
    }

    /**
     * 批量设置缓存
     * @param {Object} items 键值对对象
     * @param {number} ttl 过期时间（秒）
     * @returns {Promise<boolean>} 是否设置成功
     */
    async mset(items, ttl = null) {
        try {
            const promises = Object.entries(items).map(([key, value]) =>
                this.set(key, value, ttl)
            );

            await Promise.all(promises);
            return true;
        } catch (error) {
            this.logger.error('批量缓存设置失败:', { items, error: error.message });
            this.stats.errors++;
            return false;
        }
    }

    /**
     * 清空所有缓存
     * @returns {Promise<boolean>} 是否清空成功
     */
    async clear() {
        try {
            // 清空内存缓存
            if (this.config.enableMemoryCache) {
                this.memoryCache.clear();
                this.stats.memorySize = 0;
            }

            // 清空Redis缓存（只清空带前缀的键）
            if (this.config.enableRedisCache && this.redisService.isConnected) {
                try {
                    const pattern = this.config.keyPrefix + '*';
                    await this.redisService.delPattern(pattern);
                } catch (redisError) {
                    this.logger.error('Redis缓存清空失败:', redisError);
                    this.stats.errors++;
                }
            }

            this.logger.info('所有缓存已清空');
            return true;
        } catch (error) {
            this.logger.error('缓存清空失败:', error);
            this.stats.errors++;
            return false;
        }
    }

    /**
     * 构建完整的缓存键
     * @param {string} key 原始键
     * @returns {string} 完整的缓存键
     */
    buildKey(key) {
        return this.config.keyPrefix + key;
    }

    /**
     * 从内存缓存获取值
     * @param {string} key 缓存键
     * @returns {any} 缓存值或null
     */
    getFromMemory(key) {
        const item = this.memoryCache.get(key);
        if (!item) {
            return null;
        }

        // 检查是否过期
        if (item.expiresAt <= Date.now()) {
            this.memoryCache.delete(key);
            this.stats.memorySize--;
            return null;
        }

        return item.value;
    }

    /**
     * 设置值到内存缓存
     * @param {string} key 缓存键
     * @param {any} value 缓存值
     * @param {number} ttl 过期时间（秒）
     */
    setToMemory(key, value, ttl) {
        // 检查缓存大小限制
        if (this.memoryCache.size >= this.config.memoryCacheSize) {
            // 删除最旧的项（简单的LRU策略）
            const oldestKey = this.memoryCache.keys().next().value;
            if (oldestKey) {
                this.memoryCache.delete(oldestKey);
                this.stats.memorySize--;
            }
        }

        const expiresAt = Date.now() + (ttl * 1000);
        this.memoryCache.set(key, {
            value,
            expiresAt,
            accessTime: Date.now()
        });

        this.stats.memorySize++;
    }

    /**
     * 启动内存缓存清理定时器
     */
    startMemoryCacheCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // 每分钟清理一次过期的内存缓存
        this.cleanupInterval = setInterval(() => {
            this.cleanExpiredMemoryCache();
        }, 60000);
    }

    /**
     * 清理过期的内存缓存
     */
    cleanExpiredMemoryCache() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, item] of this.memoryCache.entries()) {
            if (item.expiresAt <= now) {
                this.memoryCache.delete(key);
                cleanedCount++;
                this.stats.memorySize--;
            }
        }

        if (cleanedCount > 0) {
            this.logger.debug(`清理了 ${cleanedCount} 个过期的内存缓存项`);
        }
    }

    /**
     * 获取缓存统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const totalRequests = this.stats.hits + this.stats.misses;
        const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests * 100).toFixed(2) : 0;
        const memoryHitRate = this.stats.hits > 0 ? (this.stats.memoryHits / this.stats.hits * 100).toFixed(2) : 0;
        const redisHitRate = this.stats.hits > 0 ? (this.stats.redisHits / this.stats.hits * 100).toFixed(2) : 0;

        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            memoryHitRate: `${memoryHitRate}%`,
            redisHitRate: `${redisHitRate}%`,
            memoryCacheSize: this.memoryCache.size,
            redisConnected: this.redisService.isConnected
        };
    }

    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            memoryHits: 0,
            redisHits: 0,
            errors: 0,
            memorySize: this.memoryCache.size
        };
    }

    /**
     * 关闭缓存服务
     */
    async close() {
        try {
            // 停止清理定时器
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }

            // 清空内存缓存
            this.memoryCache.clear();
            this.stats.memorySize = 0;

            // 关闭Redis服务
            if (this.redisService) {
                await this.redisService.close();
            }

            this.logger.info('缓存服务已关闭');
        } catch (error) {
            this.logger.error('关闭缓存服务时出错:', error);
        }
    }

    /**
     * 获取单例实例
     * @returns {CacheService} 缓存服务实例
     */
    static getInstance() {
        if (!CacheService.instance) {
            CacheService.instance = new CacheService();
        }
        return CacheService.instance;
    }
}

// 导出单例实例
const cacheService = CacheService.getInstance();

module.exports = {
    CacheService,
    cacheService
};