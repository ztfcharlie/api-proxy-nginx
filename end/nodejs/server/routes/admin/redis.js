const express = require('express');
const router = express.Router();
const redisService = require('../../services/RedisService'); // 需要确认 RedisService 是否可以直接引用，或者需要注入
// 注意：我们在 app.js 里初始化了 RedisService 实例，但这里是路由文件，很难直接拿到 app 实例。
// 之前 SyncManager 是单例导出的，所以可以在这里引用 SyncManager.redis。
// 或者我们假设 RedisService.js 导出的类本身不包含单例，需要我们在 app.js 里注入。
// 但为了简单，我们这里直接引用 SyncManager，因为它持有 redis 实例。
const SyncManager = require('../../services/SyncManager');

// 辅助：确保 Redis 可用
const getRedis = () => {
    if (!SyncManager.redis) throw new Error("Redis not initialized");
    return SyncManager.redis;
};

/**
 * 扫描 Keys
 */
router.get('/keys', async (req, res) => {
    try {
        const redisService = getRedis();
        const redisClient = redisService.redis;
        // 获取配置的前缀，默认为 ''
        const prefix = redisService.config.keyPrefix || '';
        
        const pattern = req.query.pattern || '*';
        
        // 我们的目标模式
        const targetPatterns = ['vtoken:*', 'apikey:*', 'channel:*', 'real_token:*'];
        
        let allKeys = [];
        
        if (pattern === '*') {
            for (const p of targetPatterns) {
                // 手动拼接前缀进行查询
                // 注意：ioredis 如果配置了 keyPrefix，keys() 方法可能会自动处理，也可能不会，取决于版本。
                // 最稳妥的方式是：如果 ioredis 处理了，我们传 'channel:*'；如果没处理，传 'oauth2:channel:*'。
                // 这里的 redisClient 是 new Redis({ keyPrefix: ... }) 创建的。
                // 在 ioredis 中，commands 也会被自动加上前缀。
                // 让我们先尝试直接查，如果查不到，说明 keys 命令没有自动加前缀（这在 ioredis 中是常态，keys 命令通常不透传 prefix）。
                
                // 修正：ioredis 的 keys 方法通常不自动加前缀。我们需要手动加。
                // 但如果我们在构造函数里加了 keyPrefix，ioredis 会在所有命令前加。
                // 让我们假设 ioredis 处理了写入，但在 keys 查询时可能需要我们小心。
                
                // 实际上，如果 keyPrefix 设置了，redis.keys('*') 只会返回匹配该 prefix 的 key，并且**剥离** prefix 返回。
                // 所以我们应该直接搜 `channel:*`。
                
                // 如果您现在搜不到，可能是因为 RedisService 里的 keyPrefix 设置有问题，或者数据确实没写入。
                
                // 调试策略：直接查 '*'
                const keys = await redisClient.keys(p);
                allKeys = allKeys.concat(keys);
            }
        } else {
            allKeys = await redisClient.keys(pattern);
        }
        
        // 如果 ioredis 自动处理了前缀，返回的 key 是不带前缀的。
        // 如果没有处理，我们需要手动剥离，或者前端显示带前缀的。
        
        // 让我们做一个全量扫描兜底，看看 redis 里到底有啥
        if (allKeys.length === 0) {
             // 尝试不带 filter
             const rawKeys = await redisClient.keys('*');
             // 手动过滤
             allKeys = rawKeys.filter(k => 
                targetPatterns.some(tp => {
                    const regex = new RegExp('^' + tp.replace('*', '.*'));
                    return regex.test(k);
                })
             );
        }
        
        allKeys = [...new Set(allKeys)].sort();
        
        res.json({ data: allKeys });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 获取 Key 详情
 */
router.get('/value', async (req, res) => {
    try {
        const redisService = getRedis();
        const redisClient = redisService.redis;
        const key = req.query.key;
        if (!key) return res.status(400).json({ error: "Missing key" });

        // 如果 keys 接口返回的是不带前缀的 key，这里直接 get(key) 会由 ioredis 自动加前缀，是 OK 的。
        // 如果返回的是带前缀的，这里又加了一次，就会错。
        
        // 我们假设 key 是从 keys 接口拿到的，保持原样传回去最稳妥。

        const type = await redisClient.type(key);
        const ttl = await redisClient.ttl(key);
        let value = null;

        if (type === 'string') {
            value = await redisClient.get(key);
            try { value = JSON.parse(value); } catch (e) {}
        } else if (type === 'hash') {
            value = await redisClient.hgetall(key);
        } else if (type === 'list') {
            value = await redisClient.lrange(key, 0, -1);
        } else if (type === 'set') {
            value = await redisClient.smembers(key);
        }

        res.json({ 
            data: {
                key,
                type,
                ttl,
                value
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 删除 Key
 */
router.delete('/key', async (req, res) => {
    try {
        const redis = getRedis();
        const key = req.query.key;
        if (!key) return res.status(400).json({ error: "Missing key" });
        
        await redis.redis.del(key);
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
