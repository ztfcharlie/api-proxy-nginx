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
        
        console.log(`[Redis Inspector] Scanning keys. Prefix: "${prefix}", Pattern: "${req.query.pattern || '*'}"`);
        
        const pattern = req.query.pattern || '*';
        
        // 我们的目标模式
        const targetPatterns = ['vtoken:*', 'apikey:*', 'channel:*', 'real_token:*'];
        
        let allKeys = [];
        
        if (pattern === '*') {
            for (const p of targetPatterns) {
                // 手动拼接前缀
                const searchPattern = prefix + p;
                console.log(`[Redis Inspector] Searching for: ${searchPattern}`);
                
                const keys = await redisClient.keys(searchPattern);
                console.log(`[Redis Inspector] Found:`, keys.length);
                
                // 剥离前缀以便前端显示整洁
                const strippedKeys = keys.map(k => k.startsWith(prefix) ? k.slice(prefix.length) : k);
                allKeys = allKeys.concat(strippedKeys);
            }
        } else {
            // 自定义搜索也需要加前缀
            const keys = await redisClient.keys(prefix + pattern);
            const strippedKeys = keys.map(k => k.startsWith(prefix) ? k.slice(prefix.length) : k);
            allKeys = strippedKeys;
        }
        
        // ... (rest of the code)
        
        // 这里的 value 获取也需要注意，如果我们传给 get 的是不带 prefix 的 key，
        // ioredis 会自动加上 prefix，所以这是对的。
        // 前端传来的 key 是 stripped 的，后端 get(key) -> ioredis -> prefix + key -> OK.
        
        allKeys = [...new Set(allKeys)].sort();
        
        // 如果为空，尝试无视 prefix 扫描所有 (仅用于调试)
        if (allKeys.length === 0) {
             console.log('[Redis Inspector] No keys found with prefix. Trying raw scan...');
             // 注意：如果不通过 redisClient (它带prefix) 而是创建一个不带 prefix 的 client 才能查到原始 key。
             // 这里我们假设数据确实没写入，或者写入到了别的地方。
        }
        
        allKeys = [...new Set(allKeys)].sort();
        console.log(`[Redis Inspector] Total keys returning:`, allKeys.length);
        
        res.json({ data: allKeys });
    } catch (err) {
        console.error('[Redis Inspector] Error:', err);
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
