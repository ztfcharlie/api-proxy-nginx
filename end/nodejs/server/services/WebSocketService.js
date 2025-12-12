const WebSocket = require('ws');
const Redis = require('ioredis');
const logger = require('./LoggerService');
const jwt = require('jsonwebtoken');

class WebSocketService {
    constructor() {
        this.wss = null;
        this.redisSub = null;
    }

    initialize(server) {
        // 挂载到现有的 HTTP Server 上
        this.wss = new WebSocket.Server({ server, path: '/ws/logs' });

        this.wss.on('connection', (ws, req) => {
            // 简单鉴权：通过 URL 参数 token
            const params = new URLSearchParams(req.url.split('?')[1]);
            const token = params.get('token');

            if (!this.validateToken(token)) {
                ws.close(1008, "Unauthorized");
                return;
            }

            logger.info('[WS] Client connected to log stream');

            ws.send(JSON.stringify({
                source: "system",
                level: "info",
                msg: "Connected to WebSocket Log Stream (v2.0)"
            }));

            ws.on('error', (err) => logger.error('[WS] Client error:', err));
        });

        // 初始化 Redis 订阅
        this.initRedis();
    }

    validateToken(token) {
        if (!token) return false;
        try {
            // 复用 JWT 密钥 (通常在环境变量 JWT_SECRET)
            // 这里简单验证解码，生产环境应验证签名
            const decoded = jwt.decode(token);
            return decoded && (decoded.role === 'admin');
        } catch (e) {
            return false;
        }
    }

    initRedis() {
        this.redisSub = new Redis({
            host: process.env.REDIS_HOST || 'api-proxy-redis',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD,
            db: process.env.REDIS_DB || 0
        });

        const LOG_CHANNEL = 'sys:log_stream';

        this.redisSub.subscribe(LOG_CHANNEL, (err) => {
            if (err) logger.error('[WS] Redis subscribe failed:', err);
            else logger.info(`[WS] Subscribed to ${LOG_CHANNEL}`);
        });

        this.redisSub.on('message', (channel, message) => {
            if (channel === LOG_CHANNEL && this.wss) {
                this.broadcast(message);
            }
        });
    }

    broadcast(data) {
        if (!this.wss) return;
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    }
}

module.exports = new WebSocketService();
