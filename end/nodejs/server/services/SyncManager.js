const Redis = require('ioredis');
const mysql = require('mysql2/promise');

// 配置 (建议换成环境变量)
const config = {
    redis: { host: 'api-proxy-redis', port: 6379 },
    db: { host: 'mysql', user: 'root', password: 'password', database: 'ai_proxy' }
};

const redis = new Redis(config.redis);
const dbPool = mysql.createPool(config.db);

class SyncManager {
    /**
     * 全量同步：将 MySQL 中的路由规则和 Key 信息刷入 Redis
     */
    async syncAll() {
        console.log('Starting full sync from MySQL to Redis...');
        
        try {
            // 1. 同步 API Key 索引 (sk-mock-...)
            // SELECT id, access_key FROM sys_virtual_keys WHERE type != 'vertex'
            const [vKeys] = await dbPool.query('SELECT id, access_key FROM sys_virtual_keys WHERE type != "vertex" AND status = 1');
            
            const pipeline = redis.pipeline();
            
            for (const vk of vKeys) {
                // Key: vkey_idx:sk-mock-xxxx -> Value: virtual_key_id
                pipeline.set(`vkey_idx:${vk.access_key}`, vk.id);
            }
            
            // 2. 同步路由规则
            // Key: route:{virtual_key_id}
            // 我们需要聚合查询：Virtual Key -> List of [Channel + Rule]
            
            // 获取所有活跃的 Virtual Key IDs
            const [allVkIds] = await dbPool.query('SELECT id FROM sys_virtual_keys WHERE status = 1');
            
            for (const vkRow of allVkIds) {
                const vkId = vkRow.id;
                
                // 查询该 vk 绑定的所有 channels
                const [rules] = await dbPool.query(`
                    SELECT 
                        r.weight, r.model_whitelist,
                        c.id as channel_id, c.type, c.base_url, c.credentials
                    FROM sys_route_rules r
                    JOIN sys_channels c ON r.channel_id = c.id
                    WHERE r.virtual_key_id = ? AND c.status = 1
                `, [vkId]);
                
                if (rules.length > 0) {
                    // 序列化存入 Redis
                    // 注意：为了 Lua 处理方便，credentials 如果是 JSON string 要 parse 或者是简化
                    const redisVal = rules.map(r => {
                        let creds = r.credentials;
                        // 如果是 vertex，Lua 不需要完整的 credentials，只需要知道去哪拿 token
                        // 如果是 openai，Lua 需要 api_key
                        if (typeof creds === 'string') {
                            try { creds = JSON.parse(creds); } catch(e) {}
                        }
                        
                        return {
                            channel_id: r.channel_id,
                            type: r.type,
                            weight: r.weight,
                            // models: r.model_whitelist, // 暂时简化
                            credentials: { api_key: creds.api_key } // 仅针对 OpenAI 等静态 Key
                        };
                    });
                    
                    pipeline.set(`route:${vkId}`, JSON.stringify(redisVal));
                }
            }
            
            await pipeline.exec();
            console.log('Sync completed successfully.');
            
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }
}

// 允许独立运行
if (require.main === module) {
    new SyncManager().syncAll().then(() => process.exit(0));
}

module.exports = SyncManager;
