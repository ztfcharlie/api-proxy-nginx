const express = require('express');
const router = express.Router();
const Redis = require('ioredis'); // Import Redis class
const SyncManager = require('../../services/SyncManager');

// 创建一个无前缀的专用客户端用于扫描
// 注意：每次请求创建销毁可能开销大，建议改为单例或复用配置
// 这里为了稳妥，我们临时创建一个
const getRawRedis = () => {
    return new Redis({
        host: process.env.REDIS_HOST || 'api-proxy-redis',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0,
        keyPrefix: '' // 显式为空
    });
};

/**
 * 扫描 Keys
 */
router.get('/keys', async (req, res) => {
    const rawRedis = getRawRedis();
    try {
        // 获取实际使用的前缀 (用于过滤)
        const servicePrefix = SyncManager.redis?.config?.keyPrefix || 'oauth2:';
        const pattern = req.query.pattern || '*';
        
        // 我们的目标模式 (加上前缀)
        const targetPatterns = ['vtoken:*', 'apikey:*', 'channel:*', 'real_token:*'];
        
        let allKeys = [];
        
        if (pattern === '*') {
            for (const p of targetPatterns) {
                // 手动拼接前缀
                const searchPattern = servicePrefix + p;
                console.log(`[Redis Inspector] Raw Scan: ${searchPattern}`);
                
                const keys = await rawRedis.keys(searchPattern);
                allKeys = allKeys.concat(keys);
            }
        } else {
            // 自定义搜索
            const keys = await rawRedis.keys(pattern.includes('*') ? pattern : `*${pattern}*`);
            allKeys = keys;
        }
        
        // 过滤掉非相关 Key (可选)
        // ...

        allKeys = [...new Set(allKeys)].sort();
        
        res.json({ data: allKeys });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        rawRedis.quit(); // 务必关闭连接
    }
});

/**
 * 获取 Key 详情
 */
router.get('/value', async (req, res) => {
    const rawRedis = getRawRedis();
    try {
        const key = req.query.key;
        if (!key) return res.status(400).json({ error: "Missing key" });

        const type = await rawRedis.type(key);
        const ttl = await rawRedis.ttl(key);
        let value = null;

        if (type === 'string') {
            value = await rawRedis.get(key);
            try { value = JSON.parse(value); } catch (e) {}
        } else if (type === 'hash') {
            value = await rawRedis.hgetall(key);
        } else if (type === 'list') {
            value = await rawRedis.lrange(key, 0, -1);
        } else if (type === 'set') {
            value = await rawRedis.smembers(key);
        }

        res.json({ 
            data: { key, type, ttl, value }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        rawRedis.quit();
    }
});

/**
 * 删除 Key
 */
router.delete('/key', async (req, res) => {
    const rawRedis = getRawRedis();
    try {
        const key = req.query.key;
        if (!key) return res.status(400).json({ error: "Missing key" });
        
        await rawRedis.del(key);
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        rawRedis.quit();
    }
});

/**
 * 手动触发全量同步
 */
router.post('/sync', async (req, res) => {
    try {
        await SyncManager.performFullSync();
        res.json({ message: "Full sync triggered" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
