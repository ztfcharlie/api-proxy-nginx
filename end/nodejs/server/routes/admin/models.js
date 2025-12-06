const express = require('express');
const router = express.Router();
const db = require('../../config/db').dbPool;
const logger = require('../../services/LoggerService');

/**
 * 获取模型列表
 */
router.get('/', async (req, res) => {
    try {
        const { provider } = req.query;
        let query = "SELECT * FROM sys_models WHERE 1=1";
        let params = [];
        
        if (provider) {
            query += " AND provider = ?";
            params.push(provider);
        }
        
        query += " ORDER BY provider, name";
        const [models] = await db.query(query, params);
        res.json({ data: models });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 创建模型
 */
router.post('/', async (req, res) => {
    const { provider, name, price_input, price_output, price_cache, price_time, price_request } = req.body;
    if (!provider || !name) return res.status(400).json({ error: "Missing provider or name" });
    
    try {
        await db.query(
            `INSERT INTO sys_models 
            (provider, name, price_input, price_output, price_cache, price_time, price_request) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [provider, name, price_input||0, price_output||0, price_cache||0, price_time||0, price_request||0]
        );
        res.status(201).json({ message: "Model created" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 更新模型
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const body = req.body;
    // 过滤允许更新的字段
    const allowed = ['price_input', 'price_output', 'price_cache', 'price_time', 'price_request', 'status'];
    const updates = [];
    const params = [];
    
    allowed.forEach(field => {
        if (body[field] !== undefined) {
            updates.push(`${field} = ?`);
            params.push(body[field]);
        }
    });
    
    if (updates.length === 0) return res.json({ message: "No changes" });
    
    params.push(id);
    try {
        await db.query(`UPDATE sys_models SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ message: "Model updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 删除模型
 */
router.delete('/:id', async (req, res) => {
    try {
        // 1. 获取模型名称
        const [models] = await db.query("SELECT name FROM sys_models WHERE id = ?", [req.params.id]);
        if (models.length === 0) return res.json({ message: "Model not found" });
        const modelName = models[0].name;

        // 2. 检查引用 (简单 JSON 字符串匹配)
        // models_config 是一个对象: {"model-name": ...}
        // 我们查找 key 为 modelName 的情况
        const searchPattern = `%"${modelName}":%`;
        const [channels] = await db.query("SELECT name FROM sys_channels WHERE models_config LIKE ?", [searchPattern]);

        if (channels.length > 0) {
            const channelNames = channels.map(c => c.name).join(', ');
            return res.status(400).json({ 
                error: `无法删除: 该模型已被以下渠道绑定: ${channelNames}` 
            });
        }

        // 3. 删除
        await db.query("DELETE FROM sys_models WHERE id = ?", [req.params.id]);
        res.json({ message: "Model deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
