const express = require('express');
const router = express.Router();
const db = require('../../config/db').dbPool;

/**
 * 获取日志列表
 */
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, token_key, status, model } = req.query;
        const offset = (page - 1) * limit;
        
        let query = "SELECT id, request_id, token_key, model, status_code, duration_ms, total_tokens, created_at FROM sys_request_logs WHERE 1=1";
        let params = [];

        // [RBAC] 普通用户只能看自己的日志
        if (req.user.role !== 'admin') {
            query += " AND user_id = ?";
            params.push(req.user.id);
        }
        
        if (token_key) {
            query += " AND token_key LIKE ?";
            params.push(`%${token_key}%`);
        }
        if (status) {
            query += " AND status_code = ?";
            params.push(status);
        }
        if (model) {
            query += " AND model LIKE ?";
            params.push(`%${model}%`);
        }
        
        // 排序
        query += " ORDER BY id DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), offset);
        
        const [logs] = await db.query(query, params);
        
        // 总数 (为了性能，建议不要每次都 count(*)，或者限制 count)
        // 这里简单处理
        const countQuery = query.replace("SELECT id, request_id, token_key, model, status_code, duration_ms, total_tokens, created_at", "SELECT COUNT(*) as total").split("ORDER BY")[0];
        // 注意：params 需要截断，去掉 limit 和 offset
        const countParams = params.slice(0, params.length - 2);
        
        const [countRes] = await db.query(countQuery, countParams);
        
        res.json({
            data: logs,
            pagination: {
                total: countRes[0].total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 获取单个日志详情 (包含 Body)
 */
router.get('/:id', async (req, res) => {
    try {
        const [logs] = await db.query("SELECT * FROM sys_request_logs WHERE id = ?", [req.params.id]);
        if (logs.length === 0) return res.status(404).json({ error: "Log not found" });
        
        const log = logs[0];
        if (req.user.role !== 'admin' && log.user_id !== req.user.id) {
            return res.status(403).json({ error: "Forbidden" });
        }

        res.json({ data: log });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
