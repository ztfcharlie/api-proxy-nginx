const express = require('express');
const router = express.Router();
const jobManager = require('../../services/JobManager');

/**
 * 获取所有任务状态
 */
router.get('/', (req, res) => {
    const jobs = jobManager.getAllJobs();
    res.json({ data: jobs });
});

/**
 * 手动触发任务
 */
router.post('/:name/run', async (req, res) => {
    const { name } = req.params;
    try {
        // 异步执行，前端不等待长任务
        jobManager.runJob(name).catch(err => console.error(err));
        res.json({ message: `Job ${name} triggered` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
