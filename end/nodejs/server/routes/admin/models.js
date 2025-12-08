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
    
    try {
        // 1. 获取模型信息
        const [currentModels] = await db.query("SELECT name FROM sys_models WHERE id = ?", [id]);
        if (currentModels.length === 0) return res.status(404).json({ error: "Model not found" });
        const modelName = currentModels[0].name;

        // 2. 识别被禁用的计费模式
        const checks = [];
        
        // 检查 Token 模式 (Input/Output 只要有一个还在就不算彻底禁用，但为了安全，如果任一被置0且在用，可以报错，或者只在全0时报错？
        // 按照前端逻辑：price_input<=0 AND price_output<=0 才会禁用 Token 选项。
        // 这里严格一点：如果正在用 Token 模式，不允许把 Input 或 Output 改为 0 (除非原来就是0)
        // 简化逻辑：如果请求显式将 Input 或 Output 设为 <= 0，检查是否有 Token 模式的使用者
        if ((body.price_input !== undefined && parseFloat(body.price_input) <= 0) || 
            (body.price_output !== undefined && parseFloat(body.price_output) <= 0)) {
            checks.push({ mode: 'token', field: 'price_input/output' });
        }
        
        if (body.price_request !== undefined && parseFloat(body.price_request) <= 0) {
            checks.push({ mode: 'request', field: 'price_request' });
        }
        
        if (body.price_time !== undefined && parseFloat(body.price_time) <= 0) {
            checks.push({ mode: 'time', field: 'price_time' });
        }

        // 3. 执行依赖检查
        if (checks.length > 0) {
            // 粗略查找所有包含该模型的渠道
            const searchPattern = `%"${modelName}":%`;
            const [channels] = await db.query(
                "SELECT name, models_config FROM sys_channels WHERE status = 1 AND models_config LIKE ?", 
                [searchPattern]
            );

            for (const channel of channels) {
                let config = {};
                try {
                    config = typeof channel.models_config === 'string' ? JSON.parse(channel.models_config) : channel.models_config;
                } catch (e) { continue; }

                const modelConfig = config[modelName];
                if (!modelConfig) continue;

                // 确定该渠道当前使用的模式
                let currentMode = 'token'; // 默认
                if (typeof modelConfig === 'object' && modelConfig.mode) {
                    currentMode = modelConfig.mode;
                }

                // 检查冲突
                for (const check of checks) {
                    if (currentMode === check.mode) {
                        return res.status(400).json({ 
                            error: `Cannot disable ${check.mode} pricing (via ${check.field}): Channel '${channel.name}' is using this mode for model '${modelName}'.` 
                        });
                    }
                }
            }
        }

        // 4. 执行更新
        const allowed = ['price_input', 'price_output', 'price_cache', 'price_time', 'price_request', 'status', 'name', 'provider'];
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
