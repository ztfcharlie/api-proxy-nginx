const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db').dbPool;
const logger = require('../services/LoggerService');

const router = express.Router();

module.exports = function(redisService, serviceAccountManager) {

    /**
     * 辅助函数：简单负载均衡选择器
     * 根据 sys_token_routes 选择一个合适的渠道
     */
    async function selectChannel(virtualTokenId) {
        // 1. 查询该 Virtual Token 绑定的所有可用规则
        const query = `
            SELECT r.channel_id, r.weight, c.name 
            FROM sys_token_routes r
            JOIN sys_channels c ON r.channel_id = c.id
            WHERE r.virtual_token_id = ? AND c.status = 1
        `;
        const [rules] = await db.query(query, [virtualTokenId]);

        if (rules.length === 0) {
            throw new Error('No available channels for this token');
        }

        // 2. 简单随机权重算法 (也可以轮询)
        const randomIndex = Math.floor(Math.random() * rules.length);
        return rules[randomIndex];
    }

    // GET/POST /o/oauth2/auth (Mock Authorization Endpoint)
    const handleAuth = (req, res) => {
        const { redirect_uri, state, response_type, client_id } = req.query.redirect_uri ? req.query : req.body;
        
        if (!redirect_uri) {
            return res.status(400).send('Missing redirect_uri');
        }

        // 生成一个假的授权码
        const fakeCode = '4/fake-auth-code-' + uuidv4();
        
        // 构建重定向 URL
        const url = new URL(redirect_uri);
        url.searchParams.set('code', fakeCode);
        if (state) url.searchParams.set('state', state);
        
        logger.info(`Mock Auth: Redirecting to ${url.toString()}`);
        res.redirect(url.toString());
    };

    router.get('/o/oauth2/auth', handleAuth);
    router.post('/o/oauth2/auth', handleAuth);

    // POST /token
    router.post('/token', async (req, res) => {
        const grantType = req.body.grant_type;
        const assertion = req.body.assertion; // 客户端签名的 JWT

        // 1. 基础参数校验
        if (grantType !== 'urn:ietf:params:oauth:grant-type:jwt-bearer' || !assertion) {
            return res.status(400).json({ error: 'invalid_request', error_description: 'Missing grant_type or assertion' });
        }

        try {
            // 2. 解码 JWT Header 获取 Key ID (kid) 或直接解码 payload 获取 iss (client_email)
            const decoded = jwt.decode(assertion, { complete: true });
            if (!decoded) {
                return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid JWT format' });
            }

            const clientEmail = decoded.payload.iss; 
            
            // 3. 查找对应的 Virtual Token
            // Vertex 的 client_email 存储在 token_key 字段
            // 增强：同时检查用户状态 (u.status = 1)
            const [tokens] = await db.query(
                `SELECT t.id, t.user_id, t.public_key, t.limit_config 
                 FROM sys_virtual_tokens t
                 JOIN sys_users u ON t.user_id = u.id
                 WHERE t.token_key = ? AND t.status = 1 AND u.status = 1 AND t.type = 'vertex'`, 
                [clientEmail]
            );

            if (tokens.length === 0) {
                logger.warn(`Token request rejected (Invalid email, disabled token, or disabled user): ${clientEmail}`);
                return res.status(401).json({ error: 'invalid_grant', error_description: 'Invalid or disabled client' });
            }

            const vToken = tokens[0];

            // 4. 验证签名 (使用数据库中存的公钥)
            try {
                jwt.verify(assertion, vToken.public_key, { algorithms: ['RS256'] });
            } catch (err) {
                logger.warn(`Signature verification failed for user ${vToken.user_id}: ${err.message}`);
                return res.status(401).json({ error: 'invalid_grant', error_description: 'Invalid JWT signature' });
            }

            // 5. 路由选择：选一个真实的 Vertex 渠道
            let targetChannel;
            try {
                targetChannel = await selectChannel(vToken.id);
            } catch (err) {
                logger.warn(`No channels for user ${vToken.user_id}: ${err.message}`);
                return res.status(503).json({ error: 'service_unavailable', error_description: 'No upstream channels available' });
            }

            // 6. 获取真实 Google Token (从 ServiceAccountManager 缓存拿)
            let realToken;
            try {
                realToken = await serviceAccountManager.getValidToken(targetChannel.channel_id);
            } catch (err) {
                logger.error(`Failed to get real token: ${err.message}`);
                return res.status(503).json({ error: 'service_unavailable', error_description: 'Upstream token error' });
            }

            if (!realToken) {
                logger.error(`Real token is null for channel ${targetChannel.channel_id}. Upstream refresh likely failed.`);
                return res.status(503).json({ error: 'service_unavailable', error_description: 'Upstream token unavailable' });
            }

            // 7. 生成虚拟 Access Token
            // 格式模拟 Google: ya29.virtual.<uuid>
            const virtualAccessToken = 'ya29.virtual.' + uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
            const expiresIn = 3599; // 1小时 - 1秒

            // 8. 建立映射关系存入 Redis (关键步骤)
            const mappingData = {
                real_token: realToken,
                channel_id: targetChannel.channel_id,
                user_id: vToken.user_id,
                virtual_token_id: vToken.id,
                limit_config: vToken.limit_config // 透传限制配置
            };

            await redisService.set(
                `vtoken:${virtualAccessToken}`, 
                JSON.stringify(mappingData), 
                expiresIn
            );

            // 建立反向索引：记录该用户下的所有活动 Token
            // 这样在禁用用户时，可以快速找到并删除所有 Token
            try {
                const userTokensKey = `user_tokens:${vToken.user_id}`;
                await redisService.redis.sadd(redisService.config.keyPrefix + userTokensKey, virtualAccessToken);
                // 刷新过期时间 (至少比 Token 长)
                await redisService.redis.expire(redisService.config.keyPrefix + userTokensKey, 86400);
            } catch (err) {
                logger.warn(`Failed to index user token: ${err.message}`);
            }

            logger.info(`Issued virtual token for user [${vToken.user_id}] mapped to channel [${targetChannel.channel_id}]`);

            // 9. 返回响应
            res.json({
                access_token: virtualAccessToken,
                token_type: 'Bearer',
                expires_in: expiresIn
            });

        } catch (error) {
            logger.error(`Token exchange unexpected error: ${error.message}`);
            res.status(500).json({ error: 'internal_error' });
        }
    });

    return router;
};