const express = require('express');
const router = express.Router();
const db = require('../config/db').dbPool;
const logger = require('../services/LoggerService');

// [Internal] Get Channel ID for an Async Task
// Used by Nginx Lua as a fallback when Redis cache misses
router.get('/task-route', async (req, res) => {
    const { task_id } = req.query;
    
    if (!task_id) {
        return res.status(400).json({ error: "Missing task_id" });
    }

    try {
        const [rows] = await db.query(
            "SELECT channel_id FROM sys_async_tasks WHERE upstream_task_id = ? LIMIT 1",
            [task_id]
        );

        if (rows.length > 0) {
            res.json({ channel_id: rows[0].channel_id });
        } else {
            res.status(404).json({ error: "Task route not found" });
        }
    } catch (err) {
        logger.error(`[Internal] Failed to get task route for ${task_id}:`, err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
