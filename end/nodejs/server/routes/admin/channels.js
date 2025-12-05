const express = require('express');
const router = express.Router();
const db = require('../../config/db').dbPool;
const logger = require('../../services/LoggerService');
const SyncManager = require('../../services/SyncManager');
const serviceAccountManager = require('../../services/ServiceAccountManager');
const { GoogleAuth } = require('google-auth-library');

/**
 * 获取渠道列表
 */
router.get('/', async (req, res) => {
    try {
        const { type, status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let query = "SELECT id, name, type, extra_config, models_config, status, last_error, created_at FROM sys_channels WHERE 1=1";
        let params = [];
        
        if (type) {
            query += " AND type = ?";
            params.push(type);
        }
        if (status !== undefined) {
            query += " AND status = ?";
            params.push(status);
        }
        
        // 总数查询
        const countQuery = query.replace("SELECT id, name, type, extra_config, models_config, status, last_error, created_at", "SELECT COUNT(*) as total");
        const [countResult] = await db.query(countQuery, params);
        
        // 数据查询
        query += " ORDER BY id DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), offset);
        const [channels] = await db.query(query, params);
        
        res.json({
            data: channels,
            pagination: {
                total: countResult[0].total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (err) {
        logger.error('List channels failed:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 创建新渠道
 */
router.post('/', async (req, res) => {
    const { name, type, credentials, extra_config, models_config } = req.body;
    
    if (!name || !type || !credentials) {
        return res.status(400).json({ error: "Missing required fields: name, type, credentials" });
    }
    
    // 简单的凭证校验
    if (type === 'vertex') {
        try {
            JSON.parse(credentials);
        } catch (e) {
            return res.status(400).json({ error: "Credentials for Vertex must be valid JSON" });
        }
    }

    try {
        const [result] = await db.query(
            "INSERT INTO sys_channels (name, type, credentials, extra_config, models_config) VALUES (?, ?, ?, ?, ?)",
            [name, type, credentials, JSON.stringify(extra_config || {}), JSON.stringify(models_config || {})]
        );
        
        const newId = result.insertId;
        
        // 触发缓存同步
        const [newChannel] = await db.query("SELECT * FROM sys_channels WHERE id = ?", [newId]);
        await SyncManager.updateChannelCache(newChannel[0]);
        
        res.status(201).json({ id: newId, message: "Channel created successfully" });
    } catch (err) {
        logger.error('Create channel failed:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 更新渠道
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, type, credentials, extra_config, models_config, status } = req.body;
    
    try {
        let updateFields = [];
        let params = [];
        
        if (name) { updateFields.push("name = ?"); params.push(name); }
        if (type) { updateFields.push("type = ?"); params.push(type); }
        if (credentials) { updateFields.push("credentials = ?"); params.push(credentials); }
        if (extra_config) { updateFields.push("extra_config = ?"); params.push(JSON.stringify(extra_config)); }
        if (models_config) { updateFields.push("models_config = ?"); params.push(JSON.stringify(models_config)); }
        if (status !== undefined) { updateFields.push("status = ?"); params.push(status); }
        
        if (updateFields.length === 0) return res.json({ message: "No changes" });
        
        params.push(id);
        await db.query(`UPDATE sys_channels SET ${updateFields.join(", ")} WHERE id = ?`, params);
        
        // 触发缓存同步
        const [channel] = await db.query("SELECT * FROM sys_channels WHERE id = ?", [id]);
        if (channel.length > 0) {
            await SyncManager.updateChannelCache(channel[0]);
        }
        
        res.json({ message: "Channel updated successfully" });
    } catch (err) {
        logger.error('Update channel failed:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 删除渠道
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // 检查是否被引用
        const [refs] = await db.query("SELECT COUNT(*) as count FROM sys_token_routes WHERE channel_id = ?", [id]);
        if (refs[0].count > 0) {
            return res.status(400).json({ error: "Cannot delete channel: it is used by existing tokens" });
        }
        
        await db.query("DELETE FROM sys_channels WHERE id = ?", [id]);
        
        // 清除 Redis 缓存 (SyncManager 暂无 deleteChannelCache 方法，可直接操作 Redis)
        // 简单起见，触发一次全量同步或忽略（因为 key 不再被路由引用）
        // 最好是在 SyncManager 加个方法，或者直接删除 key
        // 这里暂时不做，等待 SyncManager 完善
        
        res.json({ message: "Channel deleted successfully" });
    } catch (err) {
        logger.error('Delete channel failed:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 测试连接
 */
router.post('/test-connection', async (req, res) => {
    const { type, credentials, extra_config } = req.body;
    
    try {
        if (type === 'vertex') {
            // 测试 Vertex Service Account
            let creds = credentials;
            if (typeof creds === 'string') creds = JSON.parse(creds);
            
            const auth = new GoogleAuth({
                credentials: creds,
                scopes: ['https://www.googleapis.com/auth/cloud-platform']
            });
            const client = await auth.getClient();
            const tokenRes = await client.getAccessToken();
            
            if (tokenRes.token) {
                res.json({ success: true, message: "Vertex authentication successful" });
            } else {
                res.json({ success: false, message: "Failed to get token" });
            }
        } 
        // TODO: 添加 Azure / OpenAI 测试逻辑 (简单 curl 请求)
        else {
            res.json({ success: true, message: `Test skipped for ${type} (not implemented yet)` });
        }
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;
