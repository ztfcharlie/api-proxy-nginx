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
            enableReadyCheck: false,
            maxRetriesPerRequest: 3,
            lazyConnect: false,
            keepAlive: 30000,
            connectTimeout: 10000,
            commandTimeout: 5000,
            family: 4,
            // 缓存配置 (手动管理前缀)
            keyPrefix: process.env.REDIS_KEY_PREFIX || 'oauth2:',
            enableOfflineQueue: true,
            retryDelayOnClusterDown: 300,
            maxRetriesPerRequestOnClusterDown: 3
        };

        this.logger = LoggerService;
    }

    async initialize() {
        try {
            // 创建 Redis 实例时，不传 keyPrefix 给 ioredis，防止双重前缀
            const redisOptions = { ...this.config };
            delete redisOptions.keyPrefix; 
            
            this.redis = new Redis(redisOptions);

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

            // 尝试连接，但不阻塞启动
            try {
                await this.redis.ping();
                this.isConnected = true;

                this.setupRedisConfig().catch(err => {
                    this.logger.warn('Failed to setup Redis config:', err);
                });

                this.logger.info('Redis service initialized successfully', {
                    host: this.config.host,
                    port: this.config.port,
                    db: this.config.db,
                    keyPrefix: this.config.keyPrefix
                });
            } catch (pingError) {
                this.logger.warn('Redis ping failed, service will continue without Redis:', {
                    error: pingError.message,
                    host: this.config.host,
                    port: this.config.port
                });
            }

            return true;
        } catch (error) {
            this.isConnected = false;
            this.logger.warn('Redis service initialization failed, continuing without cache:', {
                error: error.message,
                host: this.config.host,
                port: this.config.port
            });
            return true;
        }
    }

    async setupRedisConfig() {
        try {
            await this.redis.config('set', 'maxmemory-policy', 'allkeys-lru');
            await this.redis.config('set', 'notify-keyspace-events', 'Ex');
            await this.redis.config('set', 'timeout', '300');
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

            // 创建订阅客户端 (需要带 keyPrefix 吗？订阅通常也带)
            // ioredis 的 subscribe 会自动带 prefix 如果配置了。但我们现在没配置。
            // 所以我们这里需要手动带。
            
            // 注意：订阅需要新的连接。这里 this.redis 是无前缀的。
            // 所以 fullChannel 是 oauth2:xxx
            
            const subscriber = this.redis.duplicate();
            await subscriber.subscribe(fullChannel);

            // 设置消息处理
            subscriber.on('message', (subscribedChannel, message) => {
                try {
                    const parsedMessage = this.deserializeValue(message);
                    // 回调时需要去掉 prefix 吗？通常是需要的。
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
                info: {}, // 简化
                keyspace: {},
                memory: {}
            };
        } catch (error) {
            this.logger.error('Error getting Redis info:', error);
            return null;
        }
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

            return {
                status: 'healthy',
                responseTime: `${responseTime}ms`,
                connected: this.isConnected
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
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
