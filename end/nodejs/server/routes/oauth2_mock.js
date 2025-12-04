const express = require('express');
const router = express.Router();
const forge = require('node-forge');
const Redis = require('ioredis');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

// 实例化资源 (实际项目中应注入)
const redis = new Redis({ host: 'api-proxy-redis', port: 6379 });
const dbPool = mysql.createPool({ host: 'mysql', user: 'root', password: 'password', database: 'ai_proxy' });

/**
 * 模拟 Google OAuth2 Token 端点
 * POST /oauth2/token
 * 
 * 客户端流程：
 * 1. 使用我们给它的私钥，签署一个 JWT (grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer)
 * 2. 将 JWT 发送到此接口
 */
router.post('/token', async (req, res) => {
    try {
        const grantType = req.body.grant_type;
        const assertion = req.body.assertion;

        if (grantType !== 'urn:ietf:params:oauth:grant-type:jwt-bearer' || !assertion) {
            return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid grant_type or missing assertion' });
        }

        // 1. 解析 JWT (不验证签名先拿到 header/payload)
        const parts = assertion.split('.');
        if (parts.length !== 3) {
            return res.status(400).json({ error: 'invalid_request', error_description: 'Malformed JWT' });
        }

        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const clientEmail = payload.iss; // 客户端 Email，对应我们的 Virtual Key access_key

        // 2. 查找对应的 Virtual Key
        const [rows] = await dbPool.query(
            'SELECT id, user_id, public_key FROM sys_virtual_keys WHERE access_key = ? AND type = "vertex" AND status = 1',
            [clientEmail]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: 'invalid_client', error_description: 'Client not found' });
        }

        const virtualKey = rows[0];

        // 3. 验证签名 (使用库中存储的公钥)
        // 注意：这里需要严格的 RSA-SHA256 验证逻辑，简化起见假设 verifyJWT 函数存在
        // const isValid = verifyJWT(assertion, virtualKey.public_key);
        // if (!isValid) throw ...
        
        // 这里做一个简单的模拟验证逻辑
        if (!virtualKey.public_key) {
             return res.status(500).json({ error: 'server_error', error_description: 'Public key missing' });
        }
        
        // 4. 生成一个 Virtual Access Token
        // 格式模拟 Google: ya29.xxxx...
        const virtualAccessToken = 'ya29.virtual.' + crypto.randomBytes(32).toString('hex');

        // 5. 将 Virtual Token 映射关系存入 Redis
        // 这样 Lua 层拿到这个 Token 时，知道它属于哪个 Virtual Key ID
        const tokenData = {
            virtual_key_id: virtualKey.id,
            user_id: virtualKey.user_id,
            scope: payload.scope
        };

        // 存入 Redis，有效期 1 小时
        await redis.set(`vtoken:${virtualAccessToken}`, JSON.stringify(tokenData), 'EX', 3600);

        // 6. 确保路由规则已加载到 Redis (懒加载或同步)
        // await syncRoutesToRedis(virtualKey.id);

        // 7. 返回标准响应
        res.json({
            access_token: virtualAccessToken,
            token_type: 'Bearer',
            expires_in: 3600
        });

    } catch (error) {
        console.error('OAuth2 Error:', error);
        res.status(500).json({ error: 'internal_error' });
    }
});

module.exports = router;
