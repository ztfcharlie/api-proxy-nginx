const express = require('express');
const router = express.Router();
const Redis = require('ioredis');
const logger = require('../../services/LoggerService');
const fs = require('fs');
const path = require('path');
const db = require('../../config/db').dbPool;

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

/**
 * 获取日志文件列表
 */
router.get('/files', async (req, res) => {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    try {
        const nodeLogDir = '/app/logs';
        const nginxLogDir = '/app/nginx_logs';

        const getFiles = async (dir) => {
            if (!fs.existsSync(dir)) return [];
            let files = await fs.promises.readdir(dir);
            
            // 限制处理的文件数量，防止文件过多导致超时/卡顿 (取前200个)
            // 注意：readdir 返回顺序不确定，但在日志场景下通常是按名或时间。
            // 为了安全，我们先只处理前 500 个文件。
            if (files.length > 500) files = files.slice(0, 500);

            const fileStats = await Promise.all(
                files
                    .filter(f => f.endsWith('.log') || f.endsWith('.err') || f.endsWith('.out'))
                    .map(async f => {
                        try {
                            const stat = await fs.promises.stat(path.join(dir, f));
                            return {
                                name: f,
                                size: stat.size,
                                mtime: stat.mtime
                            };
                        } catch (e) { return null; }
                    })
            );
            return fileStats
                .filter(f => f !== null)
                .sort((a, b) => b.mtime - a.mtime);
        };

        const [nodeFiles, nginxFiles] = await Promise.all([
            getFiles(nodeLogDir),
            getFiles(nginxLogDir)
        ]);

        res.json({
            node: nodeFiles,
            nginx: nginxFiles
        });
    } catch (err) {
        logger.error('List log files failed:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 读取日志文件内容 (Tail模式，读取最后 100KB)
 */
router.get('/files/read', async (req, res) => {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    try {
        const { type, filename } = req.query;
        if (!filename) return res.status(400).json({ error: "Filename required" });

        let dir = '';
        if (type === 'node') dir = '/app/logs';
        else if (type === 'nginx') dir = '/app/nginx_logs';
        else return res.status(400).json({ error: "Invalid type" });

        // 防止目录遍历攻击
        const filePath = path.join(dir, path.basename(filename));
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "File not found" });
        }

        const stat = await fs.promises.stat(filePath);
        const fileSize = stat.size;
        const maxReadSize = 100 * 1024; // 100KB
        
        let start = Math.max(0, fileSize - maxReadSize);
        let length = Math.min(maxReadSize, fileSize);
        
        if (length <= 0) return res.json({ content: "", size: 0 });

        const buffer = Buffer.alloc(length);
        const fd = await fs.promises.open(filePath, 'r');
        await fd.read(buffer, 0, length, start);
        await fd.close();

        res.json({
            content: buffer.toString('utf8'),
            size: fileSize,
            truncated: start > 0
        });

    } catch (err) {
        logger.error('Read log file failed:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 获取请求日志列表 (DB Logs)
 */
router.get('/', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        
        const { page = 1, limit = 20, channel_id, user_id, status_code, request_id } = req.query;
        const offset = (page - 1) * limit;

        let query = "SELECT * FROM sys_request_logs WHERE 1=1";
        let params = [];

        // 权限控制：普通用户只能看自己的日志
        if (req.user.role !== 'admin') {
            query += " AND user_id = ?";
            params.push(req.user.id);
        } else if (user_id) {
            // 管理员可以按用户筛选
            query += " AND user_id = ?";
            params.push(user_id);
        }

        if (channel_id) {
            query += " AND channel_id = ?";
            params.push(channel_id);
        }

        if (status_code) {
            query += " AND status_code = ?";
            params.push(status_code);
        }
        
        if (request_id) {
            query += " AND request_id LIKE ?";
            params.push(`%${request_id}%`);
        }

        const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
        const [countResult] = await db.query(countQuery, params);

        query += " ORDER BY id DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), offset);

        const [logs] = await db.query(query, params);

        res.json({
            data: logs,
            pagination: {
                total: countResult[0].total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (err) {
        logger.error('List logs failed:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
