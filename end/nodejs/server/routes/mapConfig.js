const express = require('express');
const router = express.Router();
const { dbPool, redis } = require('../config/db');
const SyncManager = require('../services/SyncManager');

// 获取完整配置 (聚合 User, VirtualKeys, Channels)
router.get('/', async (req, res) => {
    try {
        // 获取所有 Clients (Virtual Keys)
        const [vKeys] = await dbPool.query(`
            SELECT vk.id, vk.access_key as client_token, vk.type as service_type, vk.status
            FROM sys_virtual_keys vk
            WHERE vk.status = 1
        `);

        const clients = [];

        for (const vk of vKeys) {
            // 获取该 Key 绑定的 Channels
            const [routes] = await dbPool.query(`
                SELECT c.name as key_filename, r.weight as key_weight, r.model_whitelist
                FROM sys_route_rules r
                JOIN sys_channels c ON r.channel_id = c.id
                WHERE r.virtual_key_id = ?
            `, [vk.id]);

            // 转换格式以适配前端 console.html
            const clientData = {
                client_token: vk.client_token,
                enable: vk.status === 1,
                service_type: vk.service_type,
                key_filename_gemini: routes.map(r => ({
                    key_filename: r.key_filename,
                    key_weight: r.key_weight,
                    models: r.model_whitelist || []
                }))
            };
            clients.push(clientData);
        }

        // 获取所有 Channels 的模型配置 (适配前端格式)
        const [channels] = await dbPool.query('SELECT name, type, credentials FROM sys_channels');
        const key_filename_gemini = [];
        
        for (const ch of channels) {
             // 简化的模型展示逻辑
             key_filename_gemini.push({
                 key_filename: ch.name,
                 models: [] // 这里暂时留空，实际应从 DB 获取
             });
        }

        res.json({ clients, key_filename_gemini });

    } catch (error) {
        console.error('Map Config Get Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 保存配置 (这是一个复杂的事务操作)
router.post('/', async (req, res) => {
    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();
        const { clients } = req.body; // 只处理 clients 部分的保存

        // 简单粗暴策略：清空旧规则，写入新规则 (实际生产需优化)
        // 1. 清理旧的 Virtual Keys
        await conn.query('DELETE FROM sys_route_rules');
        await conn.query('DELETE FROM sys_virtual_keys');

        for (const client of clients) {
            // 2. 创建 Virtual Key
            const [res] = await conn.query(`
                INSERT INTO sys_virtual_keys (user_id, access_key, type, status)
                VALUES (1, ?, ?, ?)
            `, [client.client_token, client.service_type, client.enable ? 1 : 0]);
            
            const vKeyId = res.insertId;

            // 3. 创建路由规则
            if (client.key_filename_gemini) {
                for (const rule of client.key_filename_gemini) {
                    // 查找 Channel ID (假设 name 唯一)
                    const [chRows] = await conn.query('SELECT id FROM sys_channels WHERE name = ?', [rule.key_filename]);
                    if (chRows.length > 0) {
                        await conn.query(`
                            INSERT INTO sys_route_rules (virtual_key_id, channel_id, weight, model_whitelist)
                            VALUES (?, ?, ?, ?)
                        `, [vKeyId, chRows[0].id, rule.key_weight || 10, JSON.stringify(rule.models || [])]);
                    }
                }
            }
        }

        await conn.commit();
        
        // 触发 Redis 同步
        new SyncManager().syncAll();

        res.json({ success: true });
    } catch (error) {
        await conn.rollback();
        console.error('Map Config Save Error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        conn.release();
    }
});

module.exports = router;