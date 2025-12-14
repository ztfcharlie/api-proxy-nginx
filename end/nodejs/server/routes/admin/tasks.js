const express = require('express');
const router = express.Router();
const db = require('../../config/db').dbPool;
const logger = require('../../services/LoggerService');

/**
 * 获取异步任务列表
 */
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, status, request_id, upstream_id } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT t.*, u.username 
            FROM sys_async_tasks t
            LEFT JOIN sys_users u ON t.user_id = u.id
            WHERE 1=1
        `;
        let params = [];

        // 权限控制
        if (req.user.role !== 'admin') {
            query += " AND t.user_id = ?";
            params.push(req.user.id);
        }

        if (status) {
            query += " AND t.status = ?";
            params.push(status);
        }
        
        if (request_id) {
            query += " AND t.request_id LIKE ?";
            params.push(`%${request_id}%`);
        }

        if (upstream_id) {
            query += " AND t.upstream_task_id LIKE ?";
            params.push(`%${upstream_id}%`);
        }

        // Count
        const countQuery = `SELECT COUNT(*) as total FROM sys_async_tasks t WHERE 1=1 ` + 
            (req.user.role !== 'admin' ? `AND t.user_id = ${req.user.id} ` : '') +
            (status ? `AND t.status = '${status}' ` : '') + // Simplified for count logic
            (request_id ? `AND t.request_id LIKE '%${request_id}%' ` : '') +
            (upstream_id ? `AND t.upstream_task_id LIKE '%${upstream_id}%' ` : '');
            
        // Wait, constructing SQL strings manually is dangerous. Let's reuse params logic properly.
        // Re-construct WHERE clause safely.
        let whereClause = "WHERE 1=1";
        let countParams = [];
        
        if (req.user.role !== 'admin') { whereClause += " AND user_id = ?"; countParams.push(req.user.id); }
        if (status) { whereClause += " AND status = ?"; countParams.push(status); }
        if (request_id) { whereClause += " AND request_id LIKE ?"; countParams.push(`%${request_id}%`); }
        if (upstream_id) { whereClause += " AND upstream_task_id LIKE ?"; countParams.push(`%${upstream_id}%`); }

        const [countRes] = await db.query(`SELECT COUNT(*) as total FROM sys_async_tasks ${whereClause}`, countParams);

        query += " ORDER BY t.id DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), offset);

        const [tasks] = await db.query(query, params);

        res.json({
            data: tasks,
            pagination: {
                total: countRes[0].total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (err) {
        logger.error('List tasks failed:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
