const express = require('express');
const router = express.Router();
const db = require('../../config/db').dbPool;
const logger = require('../../services/LoggerService');
const syncManager = require('../../services/SyncManager'); // Import SyncManager

// Key for global model prices
const REDIS_KEY_MODEL_PRICES = "oauth2:model_prices";

// [Refactor] Removed local sync helper. Using SyncManager to trigger Go.

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
    const { provider, name, price_input, price_output, price_cache, price_time, price_request, default_rpm, is_async } = req.body;
    if (!provider || !name) return res.status(400).json({ error: "Missing provider or name" });
    
    try {
        await db.query(
            `INSERT INTO sys_models 
            (provider, name, price_input, price_output, price_cache, price_time, price_request, default_rpm, is_async) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [provider, name, price_input||0, price_output||0, price_cache||0, price_time||0, price_request||0, default_rpm||1000, is_async?1:0]
        );
        
        // [Sync] Trigger Go Service
        await syncManager.triggerGoSync();
        
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
        const [currentModels] = await db.query("SELECT name, status FROM sys_models WHERE id = ?", [id]);
        if (currentModels.length === 0) return res.status(404).json({ error: "Model not found" });
        const currentModel = currentModels[0];
        const modelName = currentModel.name;

        // 2. 识别潜在的破坏性操作
        const checks = [];
        
        // A. 重命名检查
        if (body.name && body.name !== modelName) {
            checks.push({ type: 'rename', msg: 'renaming' });
        }

        // B. 禁用检查
        if (body.status !== undefined && parseInt(body.status) === 0 && currentModel.status === 1) {
            checks.push({ type: 'disable', msg: 'disabling' });
        }

        // C. 计费归零检查 (原有逻辑)
        if ((body.price_input !== undefined && parseFloat(body.price_input) <= 0) || 
            (body.price_output !== undefined && parseFloat(body.price_output) <= 0)) {
            checks.push({ type: 'price', mode: 'token', field: 'price_input/output' });
        }
        if (body.price_request !== undefined && parseFloat(body.price_request) <= 0) {
            checks.push({ type: 'price', mode: 'request', field: 'price_request' });
        }
        if (body.price_time !== undefined && parseFloat(body.price_time) <= 0) {
            checks.push({ type: 'price', mode: 'time', field: 'price_time' });
        }

        // 3. 执行依赖检查 (如果有任何敏感操作)
        if (checks.length > 0) {
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
                if (!modelConfig) continue; // 该渠道未配置此模型

                // 针对每种检查类型进行验证
                for (const check of checks) {
                    // 重命名或禁用：只要渠道用了这个模型，就全盘拒绝
                    if (check.type === 'rename' || check.type === 'disable') {
                        return res.status(400).json({ 
                            error: `Cannot proceed with ${check.msg} model '${modelName}': It is currently used by channel '${channel.name}'. Please unbind it first.` 
                        });
                    }

                    // 价格检查：只有当渠道使用了特定计费模式时才拒绝
                    if (check.type === 'price') {
                        let currentMode = 'token';
                        if (typeof modelConfig === 'object' && modelConfig.mode) {
                            currentMode = modelConfig.mode;
                        }
                        if (currentMode === check.mode) {
                            return res.status(400).json({ 
                                error: `Cannot disable ${check.mode} pricing (via ${check.field}): Channel '${channel.name}' is using this mode for model '${modelName}'.` 
                            });
                        }
                    }
                }
            }
        }

        // 4. 执行更新
        const allowed = ['price_input', 'price_output', 'price_cache', 'price_time', 'price_request', 'default_rpm', 'status', 'name', 'provider', 'is_async'];
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
        
        // [Sync] Trigger Go Service
        await syncManager.triggerGoSync();

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
        
        // [Sync] Trigger Go Service
        await syncManager.triggerGoSync();

        res.json({ message: "Model deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
