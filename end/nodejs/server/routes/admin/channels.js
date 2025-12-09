const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../../config/db').dbPool;
const logger = require('../../services/LoggerService');
const SyncManager = require('../../services/SyncManager');
const { GoogleAuth } = require('google-auth-library');
const AwsSigner = require('../../utils/aws_signer');

// 模型配置校验辅助函数
async function validateModelsConfig(modelsConfig) {
    if (!modelsConfig || Object.keys(modelsConfig).length === 0) return;

    const modelNames = Object.keys(modelsConfig).filter(k => k !== 'default');
    if (modelNames.length === 0) return;

    const placeholders = modelNames.map(() => '?').join(',');
    const [models] = await db.query(
        `SELECT name, price_input, price_output, price_request, price_time FROM sys_models WHERE name IN (${placeholders})`, 
        modelNames
    );
    
    const modelMap = {};
    models.forEach(m => modelMap[m.name] = m);

    for (const [modelName, config] of Object.entries(modelsConfig)) {
        if (modelName === 'default') continue;
        const globalModel = modelMap[modelName];
        if (!globalModel) continue; 
    }
}

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
        
        const countQuery = query.replace("SELECT id, name, type, extra_config, models_config, status, last_error, created_at", "SELECT COUNT(*) as total");
        const [countResult] = await db.query(countQuery, params);
        
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
        
        const channel = channels[0];
        channel.credentials = undefined; // [Security] Never return credentials
        
        res.json({ data: channel });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 创建新渠道
 */
router.post('/', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { name, type, credentials, extra_config, models_config } = req.body;
    
    if (!name || !type || !credentials) {
        return res.status(400).json({ error: "Missing required fields: name, type, credentials" });
    }
    
    if (type === 'vertex') {
        try { JSON.parse(credentials); } catch (e) { return res.status(400).json({ error: "Credentials for Vertex must be valid JSON" }); }
    }

    try {
        await validateModelsConfig(models_config);

        const [result] = await db.query(
            "INSERT INTO sys_channels (name, type, credentials, extra_config, models_config) VALUES (?, ?, ?, ?, ?)",
            [name, type, credentials, JSON.stringify(extra_config || {}), JSON.stringify(models_config || {})]
        );
        
        const newId = result.insertId;
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
        if (models_config) {
            await validateModelsConfig(models_config);
        }

        const updates = [];
        const params = [];
        
        if (name) { updates.push("name = ?"); params.push(name); }
        if (type) { updates.push("type = ?"); params.push(type); }
        if (credentials) { updates.push("credentials = ?"); params.push(credentials); }
        if (extra_config) { updates.push("extra_config = ?"); params.push(JSON.stringify(extra_config)); }
        if (models_config) { updates.push("models_config = ?"); params.push(JSON.stringify(models_config)); }
        if (status !== undefined) { updates.push("status = ?"); params.push(status); }
        
        if (updates.length === 0) return res.json({ message: "No changes" });
        
        params.push(id);
        await db.query(`UPDATE sys_channels SET ${updates.join(", ")} WHERE id = ?`, params);
        
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
        const [refs] = await db.query("SELECT COUNT(*) as count FROM sys_token_routes WHERE channel_id = ?", [id]);
        if (refs[0].count > 0) {
            return res.status(400).json({ error: "Cannot delete channel: it is used by existing tokens" });
        }
        
        await db.query("DELETE FROM sys_channels WHERE id = ?", [id]);
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
 * 测试连接 (Key Validation)
 */
router.post('/test-connection', async (req, res) => {
    const { type, credentials, extra_config } = req.body;
    
    try {
        // Vertex AI
        if (type === 'vertex') {
            let creds = credentials;
            if (typeof creds === 'string') creds = JSON.parse(creds);
            
            const auth = new GoogleAuth({
                credentials: creds,
                scopes: ['https://www.googleapis.com/auth/cloud-platform']
            });
            const client = await auth.getClient();
            const tokenRes = await client.getAccessToken();
            
            if (tokenRes.token) {
                return res.json({ success: true, message: "Vertex authentication successful" });
            } else {
                return res.json({ success: false, message: "Failed to get token" });
            }
        } 
        
        // AWS Bedrock (Real Test via AwsSigner)
        else if (type === 'aws_bedrock') {
            const region = extra_config?.region || 'us-east-1';
            const accessKeyId = extra_config?.access_key_id;
            const secretAccessKey = extra_config?.secret_access_key;

            if (!accessKeyId || !secretAccessKey) {
                return res.status(400).json({ success: false, message: "Missing AK/SK" });
            }

            const host = `bedrock.${region}.amazonaws.com`;
            const path = '/foundation-models'; // Lightweight list models call
            const method = 'GET';
            
            // AWS requires x-amz-date
            const datetime = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
            const headers = {
                'host': host,
                'x-amz-date': datetime
            };

            const authHeader = AwsSigner.sign({
                method,
                path,
                headers,
                region,
                accessKeyId,
                secretAccessKey,
                service: 'bedrock'
            });

            headers['Authorization'] = authHeader;

            await axios.get(`https://${host}${path}`, { headers, timeout: 5000 });
            return res.json({ success: true, message: "AWS Bedrock Connection Successful" });
        }

        // OpenAI / DeepSeek / Qwen
        else if (type === 'openai' || type === 'deepseek' || type === 'qwen') {
            let url = 'https://api.openai.com/v1/models';
            if (type === 'deepseek') url = 'https://api.deepseek.com/models';
            if (type === 'qwen') url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/models';
            
            await axios.get(url, {
                headers: { 'Authorization': `Bearer ${credentials}` },
                timeout: 5000
            });
            return res.json({ success: true, message: `${type} API Key is valid` });
        }

        // Anthropic
        else if (type === 'anthropic') {
            // models endpoint
            await axios.get('https://api.anthropic.com/v1/models', {
                headers: { 
                    'x-api-key': credentials, 
                    'anthropic-version': '2023-06-01'
                },
                timeout: 5000
            });
            return res.json({ success: true, message: "Anthropic API Key is valid" });
        }

        // Azure
        else if (type === 'azure') {
            const endpoint = extra_config?.endpoint;
            const apiVersion = extra_config?.api_version || '2023-05-15';
            if (!endpoint) throw new Error("Endpoint is required for Azure");
            
            const url = `${endpoint}/openai/models?api-version=${apiVersion}`;
            await axios.get(url, {
                headers: { 'api-key': credentials },
                timeout: 5000
            });
            return res.json({ success: true, message: "Azure API Key & Endpoint are valid" });
        }

        else {
            res.json({ success: true, message: `Test skipped for ${type} (not implemented yet)` });
        }
    } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
        res.status(200).json({ success: false, message: `Validation Failed (${status || 'Err'}): ${msg}` });
    }
});

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
            headers['Authorization'] = `Bearer ${channel.credentials}`;
            headers['Content-Type'] = 'application/json';
            body = {
                model: model,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 1
            };

            if (channel.type === 'openai') url = 'https://api.openai.com/v1/chat/completions';
            else if (channel.type === 'deepseek') url = 'https://api.deepseek.com/chat/completions'; // Fixed URL
            else if (channel.type === 'qwen') url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
            else if (channel.type === 'azure') {
                const extra = typeof channel.extra_config === 'string' ? JSON.parse(channel.extra_config) : channel.extra_config;
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