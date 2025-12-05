const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db').dbPool;
const logger = require('../services/LoggerService');

const router = express.Router();

module.exports = function(redisService, serviceAccountManager) {

    /**
     * 辅助函数：简单负载均衡选择器
     * 根据 sys_route_rules 选择一个合适的渠道
     */
    async function selectChannel(virtualKeyId) {
        // 1. 查询该 Virtual Key 绑定的所有可用规则
        const query = `
            SELECT r.channel_id, r.weight, c.name 
            FROM sys_route_rules r
            JOIN sys_channels c ON r.channel_id = c.id
            WHERE r.virtual_key_id = ? AND c.status = 1
        `;
        const [rules] = await db.query(query, [virtualKeyId]);

        if (rules.length === 0) {
            throw new Error('No available channels for this key');
        }

        // 2. 简单随机权重算法 (也可以轮询)
        const randomIndex = Math.floor(Math.random() * rules.length);
        return rules[randomIndex];
    }

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

            const clientEmail = decoded.payload.iss; // 通常是 service account email
            
            // 3. 查找对应的 Virtual Key
            const [keys] = await db.query(
                "SELECT id, user_id, public_key, model_whitelist FROM sys_virtual_keys WHERE client_email = ? AND status = 1", 
                [clientEmail]
            );

            if (keys.length === 0) {
                logger.warn(`Token request for unknown email: ${clientEmail}`);
                return res.status(401).json({ error: 'invalid_grant', error_description: 'Unknown client email' });
            }

            const vKey = keys[0];

            // 4. 验证签名 (使用数据库中存的公钥)
            try {
                jwt.verify(assertion, vKey.public_key, { algorithms: ['RS256'] });
            } catch (err) {
                logger.warn(`Signature verification failed for user ${vKey.user_id}: ${err.message}`);
                return res.status(401).json({ error: 'invalid_grant', error_description: 'Invalid JWT signature' });
            }

            // 5. 路由选择：选一个真实的 Vertex 渠道
            let targetChannel;
            try {
                targetChannel = await selectChannel(vKey.id);
            } catch (err) {
                logger.warn(`No channels for user ${vKey.user_id}: ${err.message}`);
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

            // 7. 生成虚拟 Access Token
            // 格式模拟 Google: ya29.virtual.<uuid>
            const virtualAccessToken = 'ya29.virtual.' + uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
            const expiresIn = 3599; // 1小时 - 1秒

            // 8. 建立映射关系存入 Redis (关键步骤)
            const mappingData = {
                real_token: realToken,
                channel_id: targetChannel.channel_id,
                user_id: vKey.user_id,
                virtual_key_id: vKey.id
            };

            await redisService.set(
                `vtoken:${virtualAccessToken}`, 
                JSON.stringify(mappingData), 
                expiresIn
            );

            logger.info(`Issued virtual token for user [${vKey.user_id}] mapped to channel [${targetChannel.channel_id}]`);

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