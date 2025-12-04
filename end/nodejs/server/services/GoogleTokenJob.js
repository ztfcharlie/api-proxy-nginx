const { GoogleAuth } = require('google-auth-library');
const Redis = require('ioredis');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 简单的配置读取 (实际项目中建议使用 dotenv)
const config = {
    redis: { host: 'api-proxy-redis', port: 6379 },
    db: { host: 'mysql', user: 'root', password: 'password', database: 'ai_proxy' }
};

const redis = new Redis(config.redis);

// 数据库连接池
const dbPool = mysql.createPool(config.db);

class GoogleTokenJob {
    constructor() {
        this.isRunning = false;
    }

    async start() {
        console.log('Starting Google Token Refresh Job...');
        this.refreshAll();
        // 每 45 分钟刷新一次 (Token 有效期 60 分钟)
        setInterval(() => this.refreshAll(), 45 * 60 * 1000);
    }

    async refreshAll() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            // 1. 从数据库获取所有状态正常的 Vertex 渠道
            const [channels] = await dbPool.query(
                'SELECT id, credentials FROM sys_channels WHERE type = ? AND status = 1',
                ['vertex']
            );

            console.log(`Found ${channels.length} Vertex channels to refresh.`);

            for (const channel of channels) {
                await this.refreshTokenForChannel(channel);
            }
        } catch (error) {
            console.error('Global refresh error:', error);
        } finally {
            this.isRunning = false;
        }
    }

    async refreshTokenForChannel(channel) {
        try {
            const creds = typeof channel.credentials === 'string' 
                ? JSON.parse(channel.credentials) 
                : channel.credentials;

            // 使用 Google Auth Library 获取 Token
            const auth = new GoogleAuth({
                credentials: creds,
                scopes: ['https://www.googleapis.com/auth/cloud-platform']
            });

            const client = await auth.getClient();
            const accessToken = await client.getAccessToken();
            const token = accessToken.token;

            if (token) {
                // 存入 Redis，供 Lua 使用
                // Key: real_token:{channel_id}
                await redis.set(`real_token:${channel.id}`, token, 'EX', 3500);
                console.log(`Refreshed token for channel ${channel.id}`);
            }
        } catch (error) {
            console.error(`Failed to refresh channel ${channel.id}:`, error.message);
            // 可以选择更新数据库中的 last_error 字段
        }
    }
}

// 如果直接运行
if (require.main === module) {
    new GoogleTokenJob().start();
}

module.exports = GoogleTokenJob;
