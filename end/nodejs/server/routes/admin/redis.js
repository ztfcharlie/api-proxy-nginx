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
        const redis = getRedis();
        const pattern = req.query.pattern || '*';
        
        // 限制扫描范围，防止生产环境阻塞
        // 我们的 key 都是有前缀的，可以硬编码几个常见前缀
        const patterns = ['vtoken:*', 'apikey:*', 'channel:*', 'real_token:*'];
        
        let allKeys = [];
        if (pattern === '*') {
            for (const p of patterns) {
                const keys = await redis.redis.keys(p);
                allKeys = allKeys.concat(keys);
            }
        } else {
            allKeys = await redis.redis.keys(pattern);
        }
        
        // 去重
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
        const redis = getRedis();
        const key = req.query.key;
        if (!key) return res.status(400).json({ error: "Missing key" });

        const type = await redis.redis.type(key);
        const ttl = await redis.redis.ttl(key);
        let value = null;

        if (type === 'string') {
            value = await redis.redis.get(key);
            try { value = JSON.parse(value); } catch (e) {}
        } else if (type === 'hash') {
            value = await redis.redis.hgetall(key);
        } else if (type === 'list') {
            value = await redis.redis.lrange(key, 0, -1);
        } else if (type === 'set') {
            value = await redis.redis.smembers(key);
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
