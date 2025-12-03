const Redis = require('ioredis');
const LoggerService = require('./LoggerService');

class RedisService {
    constructor() {
        this.redis = null;
        this.subscribers = new Map();
        this.isConnected = false;

        // 配置
        this.config = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || null,
            db: parseInt(process.env.REDIS_DB) || 0,
            retryDelayOnFailover: 100,
            enableReadyCheck: true,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            keepAlive: 30000,
            connectTimeout: 10000,
            commandTimeout: 5000,
            family: 4,
            // 缓存配置
            keyPrefix: process.env.REDIS_KEY_PREFIX || 'oauth2:',
            // 集群配置（如果需要）
            enableOfflineQueue: false,
            // 重连配置
            retryDelayOnClusterDown: 300,
            maxRetriesPerRequestOnClusterDown: 3
        };

        this.logger = LoggerService.getInstance();
    }

    async initialize() {
        try {
            // 创建 Redis 实例
            this.redis = new Redis(this.config);

            // 错误处理
            this.redis.on('error', (error) => {
                this.isConnected = false;
                this.logger.error('Redis connection error:', {
                    error: error.message,
                    code: error.code,
                    address: `${this.config.host}:${this.config.port}`
                });
            });

            // 连接成功
            this.redis.on('connect', () => {
                this.isConnected = true;
                this.logger.info('Redis connected successfully', {
                    host: this.config.host,
                    port: this.config.port,
                    db: this.config.db
                });
            });

            // 连接断开
            this.redis.on('close', () => {
                this.isConnected = false;
                this.logger.warn('Redis connection closed');
            });

            // 重连中
            this.redis.on('reconnecting', (delay) => {
                this.logger.info(`Redis reconnecting in ${delay}ms`);
            });

            // 测试连接
            await this.redis.ping();

            // 设置连接状态
            this.isConnected = true;

            // 设置一些基本配置
            await this.setupRedisConfig();

            this.logger.info('Redis service initialized successfully', {
                host: this.config.host,
                port: this.config.port,
                db: this.config.db,
                keyPrefix: this.config.keyPrefix
            });

            return true;
        } catch (error) {
            this.isConnected = false;
            this.logger.error('Failed to initialize Redis service:', error);
            throw error;
        }
    }

    async setupRedisConfig() {
        try {
            // 设置内存策略
            await this.redis.config('set', 'maxmemory-policy', 'allkeys-lru');

            // 设置过期通知
            await this.redis.config('set', 'notify-keyspace-events', 'Ex');

            // 设置连接超时
            await this.redis.config('set', 'timeout', '300');

            // 设置慢查询日志
            await this.redis.config('set', 'slowlog-log-slower-than', '1000');
            await this.redis.config('set', 'slowlog-max-len', '128');

            this.logger.info('Redis configuration applied');
        } catch (error) {
            this.logger.warn('Failed to apply Redis configuration:', error);
        }
    }

    /**
     * 获取缓存值
     */
    async get(key) {
        try {
            if (!this.isConnected) {
                this.logger.warn('Redis not connected, returning null');
                return null;
            }

            const startTime = Date.now();
            const fullKey = this.config.keyPrefix + key;

            const result = await this.redis.get(fullKey);
            const duration = Date.now() - startTime;

            this.logger.cache('get', fullKey, result !== null, duration);

            return result;
        } catch (error) {
            this.logger.error('Redis get error:', { key, error: error.message });
            return null;
        }
    }

    /**
     * 设置缓存值
     */
    async set(key, value, ttl = null) {
        try {
            if (!this.isConnected) {
                this.logger.warn('Redis not connected, skipping set operation');
                return false;
            }

            const startTime = Date.now();
            const fullKey = this.config.keyPrefix + key;
            const serializedValue = this.serializeValue(value);

            let result;
            if (ttl && ttl > 0) {
                result = await this.redis.setex(fullKey, ttl, serializedValue);
            } else {
                result = await this.redis.set(fullKey, serializedValue);
            }

            const duration = Date.now() - startTime;
            this.logger.cache('set', fullKey, true, duration);

            return result === 'OK';
        } catch (error) {
            this.logger.error('Redis set error:', { key, error: error.message });
            return false;
        }
    }

    /**
     * 删除缓存键
     */
    async delete(key) {
        try {
            if (!this.isConnected) {
                this.logger.warn('Redis not connected, skipping delete operation');
                return false;
            }

            const startTime = Date.now();
            const fullKey = this.config.keyPrefix + key;

            const result = await this.redis.del(fullKey);
            const duration = Date.now() - startTime;

            this.logger.cache('delete', fullKey, result > 0, duration);

            return result > 0;
        } catch (error) {
            this.logger.error('Redis delete error:', { key, error: error.message });
            return false;
        }
    }

    /**
     * 批量删除缓存键
     */
    async deleteMultiple(keys) {
        try {
            if (!this.isConnected || !keys || keys.length === 0) {
                return 0;
            }

            const fullKeys = keys.map(key => this.config.keyPrefix + key);
            const result = await this.redis.del(fullKeys);

            this.logger.cache('deleteMultiple', keys.join(','), result > 0, 0, {
                keyCount: keys.length,
                deletedCount: result
            });

            return result;
        } catch (error) {
            this.logger.error('Redis deleteMultiple error:', { keys, error: error.message });
            return 0;
        }
    }

    /**
     * 检查键是否存在
     */
    async exists(key) {
        try {
            if (!this.isConnected) {
                return false;
            }

            const fullKey = this.config.keyPrefix + key;
            const result = await this.redis.exists(fullKey);

            return result === 1;
        } catch (error) {
            this.logger.error('Redis exists error:', { key, error: error.message });
            return false;
        }
    }

    /**
     * 设置键的过期时间
     */
    async expire(key, seconds) {
        try {
            if (!this.isConnected) {
                return false;
            }

            const fullKey = this.config.keyPrefix + key;
            const result = await this.redis.expire(fullKey, seconds);

            return result === 1;
        } catch (error) {
            this.logger.error('Redis expire error:', { key, seconds, error: error.message });
            return false;
        }
    }

    /**
     * 获取键的剩余过期时间
     */
    async ttl(key) {
        try {
            if (!this.isConnected) {
                return -1;
            }

            const fullKey = this.config.keyPrefix + key;
            const result = await this.redis.ttl(fullKey);

            return result;
        } catch (error) {
            this.logger.error('Redis TTL error:', { key, error: error.message });
            return -1;
        }
    }

    /**
     * 原子递增
     */
    async incr(key, amount = 1) {
        try {
            if (!this.isConnected) {
                return 0;
            }

            const fullKey = this.config.keyPrefix + key;
            const result = await this.redis.incrby(fullKey, amount);

            return result;
        } catch (error) {
            this.logger.error('Redis INCR error:', { key, amount, error: error.message });
            return 0;
        }
    }

    /**
     * 原子递减
     */
    async decr(key, amount = 1) {
        try {
            if (!this.isConnected) {
                return 0;
            }

            const fullKey = this.config.keyPrefix + key;
            const result = await this.redis.decrby(fullKey, amount);

            return result;
        } catch (error) {
            this.logger.error('Redis DECR error:', { key, amount, error: error.message });
            return 0;
        }
    }

    /**
     * 发布消息
     */
    async publish(channel, message) {
        try {
            if (!this.isConnected) {
                return 0;
            }

            const fullChannel = this.config.keyPrefix + channel;
            const serializedMessage = this.serializeValue(message);

            const result = await this.redis.publish(fullChannel, serializedMessage);

            this.logger.debug('Redis message published', {
                channel: fullChannel,
                subscribers: result
            });

            return result;
        } catch (error) {
            this.logger.error('Redis publish error:', { channel, error: error.message });
            return 0;
        }
    }

    /**
     * 订阅频道
     */
    async subscribe(channel, callback) {
        try {
            if (!this.isConnected) {
                throw new Error('Redis not connected');
            }

            const fullChannel = this.config.keyPrefix + channel;

            // 创建订阅客户端
            const subscriber = this.redis.duplicate();
            await subscriber.subscribe(fullChannel);

            // 设置消息处理
            subscriber.on('message', (subscribedChannel, message) => {
                try {
                    const parsedMessage = this.deserializeValue(message);
                    callback(subscribedChannel.replace(this.config.keyPrefix, ''), parsedMessage);
                } catch (error) {
                    this.logger.error('Error processing subscribed message:', error);
                }
            });

            // 存储订阅器
            this.subscribers.set(channel, subscriber);

            this.logger.info('Subscribed to Redis channel', { channel: fullChannel });

            return true;
        } catch (error) {
            this.logger.error('Redis subscribe error:', { channel, error: error.message });
            return false;
        }
    }

    /**
     * 取消订阅
     */
    async unsubscribe(channel) {
        try {
            if (this.subscribers.has(channel)) {
                const subscriber = this.subscribers.get(channel);
                const fullChannel = this.config.keyPrefix + channel;

                await subscriber.unsubscribe(fullChannel);
                await subscriber.quit();

                this.subscribers.delete(channel);

                this.logger.info('Unsubscribed from Redis channel', { channel: fullChannel });
                return true;
            }

            return false;
        } catch (error) {
            this.logger.error('Redis unsubscribe error:', { channel, error: error.message });
            return false;
        }
    }

    /**
     * 获取哈希字段
     */
    async hget(key, field) {
        try {
            if (!this.isConnected) {
                return null;
            }

            const fullKey = this.config.keyPrefix + key;
            const result = await this.redis.hget(fullKey, field);

            return result ? this.deserializeValue(result) : null;
        } catch (error) {
            this.logger.error('Redis HGET error:', { key, field, error: error.message });
            return null;
        }
    }

    /**
     * 设置哈希字段
     */
    async hset(key, field, value, ttl = null) {
        try {
            if (!this.isConnected) {
                return false;
            }

            const fullKey = this.config.keyPrefix + key;
            const serializedValue = this.serializeValue(value);

            const result = await this.redis.hset(fullKey, field, serializedValue);

            if (ttl && ttl > 0) {
                await this.redis.expire(fullKey, ttl);
            }

            return result > 0;
        } catch (error) {
            this.logger.error('Redis HSET error:', { key, field, error: error.message });
            return false;
        }
    }

    /**
     * 获取所有哈希字段
     */
    async hgetall(key) {
        try {
            if (!this.isConnected) {
                return {};
            }

            const fullKey = this.config.keyPrefix + key;
            const result = await this.redis.hgetall(fullKey);

            // 反序列化所有值
            const deserializedResult = {};
            for (const [field, value] of Object.entries(result)) {
                deserializedResult[field] = this.deserializeValue(value);
            }

            return deserializedResult;
        } catch (error) {
            this.logger.error('Redis HGETALL error:', { key, error: error.message });
            return {};
        }
    }

    /**
     * 删除哈希字段
     */
    async hdel(key, field) {
        try {
            if (!this.isConnected) {
                return 0;
            }

            const fullKey = this.config.keyPrefix + key;
            const result = await this.redis.hdel(fullKey, field);

            return result;
        } catch (error) {
            this.logger.error('Redis HDEL error:', { key, field, error: error.message });
            return 0;
        }
    }

    /**
     * 序列化值
     */
    serializeValue(value) {
        if (typeof value === 'string') {
            return value;
        }

        if (typeof value === 'object') {
            return JSON.stringify(value);
        }

        return String(value);
    }

    /**
     * 反序列化值
     */
    deserializeValue(value) {
        if (typeof value !== 'string') {
            return value;
        }

        try {
            // 尝试解析为 JSON
            return JSON.parse(value);
        } catch (error) {
            // 如果不是 JSON，返回原始字符串
            return value;
        }
    }

    /**
     * 获取 Redis 信息
     */
    async getInfo() {
        try {
            if (!this.isConnected) {
                return null;
            }

            const info = await this.redis.info();
            const keyspace = await this.redis.info('keyspace');
            const memory = await this.redis.info('memory');

            return {
                connected: this.isConnected,
                host: this.config.host,
                port: this.config.port,
                db: this.config.db,
                info: this.parseRedisInfo(info),
                keyspace: this.parseRedisInfo(keyspace),
                memory: this.parseRedisInfo(memory)
            };
        } catch (error) {
            this.logger.error('Error getting Redis info:', error);
            return null;
        }
    }

    /**
     * 解析 Redis INFO 输出
     */
    parseRedisInfo(info) {
        const result = {};
        const lines = info.split('\r\n');

        for (const line of lines) {
            if (line && !line.startsWith('#')) {
                const [key, value] = line.split(':');
                if (key && value) {
                    result[key] = isNaN(value) ? value : Number(value);
                }
            }
        }

        return result;
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            if (!this.isConnected) {
                return {
                    status: 'unhealthy',
                    error: 'Redis not connected'
                };
            }

            const startTime = Date.now();
            await this.redis.ping();
            const responseTime = Date.now() - startTime;

            const info = await this.getInfo();

            return {
                status: 'healthy',
                responseTime: `${responseTime}ms`,
                connected: this.isConnected,
                info: info
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * 清空数据库
     */
    async flushdb() {
        try {
            if (!this.isConnected) {
                return false;
            }

            const result = await this.redis.flushdb();
            this.logger.warn('Redis database flushed');

            return result === 'OK';
        } catch (error) {
            this.logger.error('Error flushing Redis database:', error);
            return false;
        }
    }

    /**
     * 设置键值对并指定过期时间（秒）
     * @param {string} key 键
     * @param {string} value 值
     * @param {number} ttl 过期时间（秒）
     * @returns {Promise<boolean>} 是否设置成功
     */
    async setex(key, value, ttl) {
        try {
            if (!this.isConnected) {
                await this.waitForConnection();
            }

            const fullKey = this.buildKey(key);
            const result = await this.redis.setex(fullKey, ttl, value);

            return result === 'OK' || result === true;
        } catch (error) {
            this.logger.error('Failed to set key with expiration:', {
                key,
                ttl,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * 根据模式删除键
     * @param {string} pattern 键模式
     * @returns {Promise<number>} 删除的键数量
     */
    async delPattern(pattern) {
        try {
            if (!this.isConnected) {
                await this.waitForConnection();
            }

            const keys = await this.redis.keys(pattern);
            if (keys.length === 0) {
                return 0;
            }

            const deletedCount = await this.redis.del(...keys);
            this.logger.debug(`Deleted ${deletedCount} keys matching pattern: ${pattern}`);
            return deletedCount;
        } catch (error) {
            this.logger.error('Failed to delete keys by pattern:', { pattern, error: error.message });
            throw error;
        }
    }

    /**
     * 关闭连接
     */
    async close() {
        try {
            // 关闭所有订阅器
            for (const [channel, subscriber] of this.subscribers) {
                await subscriber.quit();
                this.logger.debug('Closed Redis subscriber', { channel });
            }
            this.subscribers.clear();

            // 关闭主连接
            if (this.redis) {
                await this.redis.quit();
                this.redis = null;
            }

            this.isConnected = false;
            this.logger.info('Redis service closed');
        } catch (error) {
            this.logger.error('Error closing Redis service:', error);
        }
    }
}

module.exports = RedisService;