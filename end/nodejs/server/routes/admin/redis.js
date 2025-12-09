const express = require('express');
const router = express.Router();
const SyncManager = require('../../services/SyncManager'); // Singleton with redis

/**
 * 列出所有 Redis Key
 */
router.get('/keys', async (req, res) => {
    try {
        if (!SyncManager.redis || !SyncManager.redis.isConnected) {
            return res.status(503).json({ error: 'Redis not connected' });
        }

        const { pattern = '*', count = 100, cursor = 0 } = req.query;
        // 注意：SyncManager.redis 是 RedisService 实例
        // RedisService 的 keyPrefix 配置会影响 scan 吗？
        // 如果用 ioredis 实例直接 scan，它可能会返回原始 key。
        // 但我们 RedisService 封装的方法没有暴露 scan。
        // 我们这里直接用 ioredis 实例。
        const redisClient = SyncManager.redis.redis; 
        
        // 我们加上前缀 pattern (因为用户想搜 oauth2:*)
        const keyPrefix = SyncManager.redis.config.keyPrefix || '';
        let searchPattern = pattern;
        
        // 如果用户输入的 pattern 没有前缀，我们是否自动加？
        // 假设用户想搜所有，输入 *。我们需要搜 oauth2:*。
        if (!searchPattern.startsWith(keyPrefix) && keyPrefix) {
            searchPattern = keyPrefix + searchPattern;
        }

        // 使用 SCAN 命令
        const [newCursor, rawKeys] = await redisClient.scan(cursor, 'MATCH', searchPattern, 'COUNT', count);
        
        // 去掉前缀返回给前端？或者前端显示完整 Key。显示完整 Key 比较清晰。
        // 但为了前端美观，我们可以标记 prefix。
        
        res.json({ 
            data: rawKeys, 
            cursor: newCursor,
            prefix: keyPrefix 
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * 获取单个 Key 详情
 */
router.get('/key', async (req, res) => {
    const { key } = req.query; // 完整 Key
    if (!key) return res.status(400).json({ error: 'Missing key' });

    try {
        const redisClient = SyncManager.redis.redis;
        
        // 1. Get Type
        const type = await redisClient.type(key);
        
        // 2. Get TTL
        const ttl = await redisClient.ttl(key);
        
        // 3. Get Value
        let value = null;
        if (type === 'string') {
            value = await redisClient.get(key);
        } else if (type === 'hash') {
            value = await redisClient.hgetall(key);
        } else if (type === 'set') {
            value = await redisClient.smembers(key);
        } else if (type === 'zset') {
            value = await redisClient.zrange(key, 0, -1, 'WITHSCORES');
        } else if (type === 'list') {
            value = await redisClient.lrange(key, 0, -1);
        } else {
            value = `(Unsupported type: ${type})`;
        }

        res.json({
            key,
            type,
            ttl,
            value
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * 删除 Key
 */
router.delete('/key', async (req, res) => {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'Missing key' });

    try {
        const redisClient = SyncManager.redis.redis;
        const result = await redisClient.del(key);
        res.json({ success: result > 0, message: result > 0 ? 'Key deleted' : 'Key not found' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;