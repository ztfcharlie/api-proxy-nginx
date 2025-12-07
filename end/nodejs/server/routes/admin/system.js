const express = require('express');
const router = express.Router();
const db = require('../../config/db').dbPool;
const RedisService = require('../../services/RedisService'); // instance
const axios = require('axios');

/**
 * 获取系统整体健康状态
 */
router.get('/status', async (req, res) => {
    const status = {
        mysql: { status: 'unknown', latency: 0 },
        redis: { status: 'unknown', latency: 0 },
        go_core: { status: 'unknown', last_heartbeat: null },
        nginx: { status: 'unknown' }
    };

    // 1. Check MySQL
    try {
        const start = Date.now();
        await db.query('SELECT 1');
        status.mysql = { status: 'healthy', latency: Date.now() - start };
    } catch (e) {
        status.mysql = { status: 'unhealthy', error: e.message };
    }

    // 2. Check Redis
    try {
        const redisHealth = await RedisService.healthCheck();
        status.redis = redisHealth;
    } catch (e) {
        status.redis = { status: 'unhealthy', error: e.message };
    }

    // 3. Check Go Core Service (via Redis Heartbeat)
    try {
        // Key: oauth2:sys:heartbeat:go-processor
        // RedisService 自动加前缀，所以我们只传 sys:heartbeat:go-processor
        const lastBeat = await RedisService.get('sys:heartbeat:go-processor');
        if (lastBeat) {
            const beatTime = parseInt(lastBeat);
            const now = Math.floor(Date.now() / 1000);
            const diff = now - beatTime;
            
            if (diff < 30) {
                status.go_core = { status: 'healthy', last_heartbeat: new Date(beatTime * 1000).toISOString(), lag: diff };
            } else {
                status.go_core = { status: 'warning', last_heartbeat: new Date(beatTime * 1000).toISOString(), lag: diff, message: 'Heartbeat delayed' };
            }
        } else {
            status.go_core = { status: 'unhealthy', error: 'No heartbeat found' };
        }
    } catch (e) {
        status.go_core = { status: 'unhealthy', error: e.message };
    }

    // 4. Check Nginx (HTTP Request)
    try {
        // Nginx 内部 hostname: api-proxy-nginx, 端口 8080
        const nginxUrl = 'http://api-proxy-nginx:8080/health';
        const start = Date.now();
        const ngxRes = await axios.get(nginxUrl, { timeout: 2000 });
        if (ngxRes.data && ngxRes.data.status === 'ok') {
            status.nginx = { status: 'healthy', latency: Date.now() - start };
        } else {
            status.nginx = { status: 'unhealthy', error: 'Invalid response' };
        }
    } catch (e) {
        status.nginx = { status: 'unhealthy', error: e.message };
    }

    res.json({ data: status });
});

module.exports = router;
