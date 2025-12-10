const express = require('express');
const router = express.Router();
const Redis = require('ioredis');
const logger = require('../../services/LoggerService');

// 创建一个专用的 Redis 订阅客户端
const redisSub = new Redis({
    host: process.env.REDIS_HOST || 'api-proxy-redis',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
});

// 存储活跃的 SSE 连接
let clients = [];

// 订阅 Redis 日志频道
const LOG_CHANNEL = 'sys:log_stream';
redisSub.subscribe(LOG_CHANNEL, (err, count) => {
    if (err) logger.error('Failed to subscribe to log channel:', err);
    else logger.info(`Subscribed to ${LOG_CHANNEL} for realtime logging`);
});

// 当收到 Redis 消息时，转发给所有前端客户端
redisSub.on('message', (channel, message) => {
    if (channel === LOG_CHANNEL) {
        clients.forEach(client => {
            client.res.write(`data: ${message}\n\n`);
        });
    }
});

/**
 * SSE 端点：前端连接此接口接收实时日志
 */
router.get('/stream', (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).end();
    }

    // 设置 SSE 头部
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Nginx 必须配置
    });

    res.write('data: {"source":"system", "level":"info", "msg":"Connected to Realtime Log Stream..."}\n\n');

    const clientId = Date.now();
    const newClient = {
        id: clientId,
        res
    };
    clients.push(newClient);

    // 连接关闭时清理
    req.on('close', () => {
        clients = clients.filter(c => c.id !== clientId);
    });
});

/**
 * (可选) 手动发送测试日志
 */
router.post('/emit', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({error: "Forbidden"});
    const { msg, source } = req.body;
    
    const logEntry = JSON.stringify({
        ts: new Date().toISOString(),
        source: source || 'manual',
        level: 'info',
        msg: msg || 'Test log'
    });
    
    // 发布到 Redis，触发上面的监听器
    const redisPub = require('../../services/SyncManager').redis.redis; // 复用现有连接
    if (redisPub) {
        redisPub.publish(LOG_CHANNEL, logEntry);
    }
    
    res.json({ success: true });
});

module.exports = router;