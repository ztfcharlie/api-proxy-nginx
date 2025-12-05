const express = require('express');
const router = express.Router();
const { dbPool } = require('../config/db');

// 获取服务账号列表
router.get('/', async (req, res) => {
    try {
        const [rows] = await dbPool.query(`
            SELECT id, name as display_name, type as service_type, 
                   status as enabled, created_at, credentials
            FROM sys_channels
        `);
        
        // 格式化返回
        const accounts = rows.map(row => {
            let email = '';
            let keyFilename = row.display_name;
            
            // 尝试解析 credentials 里的 email
            if (row.credentials && typeof row.credentials === 'object') {
                email = row.credentials.client_email || '';
            }
            
            return {
                id: row.id,
                display_name: row.display_name,
                service_account_email: email,
                key_filename: keyFilename,
                service_type: row.service_type,
                enabled: row.enabled === 1,
                created_at: row.created_at
            };
        });
        
        res.json({ data: accounts });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 创建服务账号
router.post('/', async (req, res) => {
    try {
        const { display_name, service_type, key_filename, service_account_email } = req.body;
        
        // 简单模拟一个 credentials 对象
        const credentials = {
            type: "service_account",
            project_id: "mock-project",
            client_email: service_account_email,
            private_key: "-----BEGIN PRIVATE KEY-----\nMOCK...\n-----END PRIVATE KEY-----\n"
        };

        await dbPool.query(`
            INSERT INTO sys_channels (name, type, credentials, status)
            VALUES (?, ?, ?, 1)
        `, [key_filename, service_type, JSON.stringify(credentials)]);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 删除服务账号
router.delete('/:id', async (req, res) => {
    try {
        await dbPool.query('DELETE FROM sys_channels WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
