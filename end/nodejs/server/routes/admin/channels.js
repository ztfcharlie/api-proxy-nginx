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
 * 获取单个渠道详情
 */
router.get('/:id', async (req, res) => {
    try {
        const [channels] = await db.query("SELECT * FROM sys_channels WHERE id = ?", [req.params.id]);
        if (channels.length === 0) return res.status(404).json({ error: "Channel not found" });
        res.json({ data: channels[0] });
    } catch (err) {
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
        
        // 清除 Redis 缓存
        if (SyncManager.redis) {
            await SyncManager.redis.delete('channel:' + id);
        }
        
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

const axios = require('axios');

// ... existing code ...

/**
 * 测试指定模型的连通性
 */
router.post('/:id/test-model', async (req, res) => {
    const { id } = req.params;
    const { model } = req.body;
    
    try {
        const [channels] = await db.query("SELECT * FROM sys_channels WHERE id = ?", [id]);
        if (channels.length === 0) return res.status(404).json({ error: "Channel not found" });
        const channel = channels[0];

        let url = '';
        let headers = {};
        let body = {};

        // 通用构造逻辑
        if (channel.type === 'openai' || channel.type === 'deepseek' || channel.type === 'qwen' || channel.type === 'azure') {
            // 基础配置
            headers['Authorization'] = `Bearer ${channel.credentials}`;
            headers['Content-Type'] = 'application/json';
            body = {
                model: model,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 1
            };

            // 厂商特定 URL
            if (channel.type === 'openai') url = 'https://api.openai.com/v1/chat/completions';
            else if (channel.type === 'deepseek') url = 'https://api.deepseek.com/v1/chat/completions';
            else if (channel.type === 'qwen') url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
            else if (channel.type === 'azure') {
                const extra = typeof channel.extra_config === 'string' ? JSON.parse(channel.extra_config) : channel.extra_config;
                // Azure URL: https://{resource}.openai.azure.com/openai/deployments/{model}/chat/completions?api-version={version}
                // 这里比较复杂，需要 deployment name。通常 model name = deployment name
                if (!extra || !extra.endpoint) throw new Error("Azure endpoint missing");
                const apiVersion = extra.api_version || '2023-05-15';
                url = `${extra.endpoint}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;
                headers['api-key'] = channel.credentials;
                delete headers['Authorization'];
            }
        } else if (channel.type === 'anthropic') {
            url = 'https://api.anthropic.com/v1/messages';
            headers['x-api-key'] = channel.credentials;
            headers['anthropic-version'] = '2023-06-01';
            headers['content-type'] = 'application/json';
            body = {
                model: model,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 1
            };
        } else {
            return res.json({ skipped: true, message: "Test not supported for this type yet" });
        }

        const start = Date.now();
        await axios.post(url, body, { headers, timeout: 10000 });
        const duration = Date.now() - start;

        res.json({ success: true, duration });

    } catch (err) {
        const errMsg = err.response ? 
            (err.response.data?.error?.message || err.response.statusText) : 
            err.message;
        res.status(400).json({ error: errMsg });
    }
});

module.exports = router;
