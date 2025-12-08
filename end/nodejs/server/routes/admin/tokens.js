const express = require('express');
const router = express.Router();
const db = require('../../config/db').dbPool;
const logger = require('../../services/LoggerService');
const SyncManager = require('../../services/SyncManager');
const forge = require('node-forge');
const { v4: uuidv4 } = require('uuid');

// 辅助函数：生成 RSA 密钥对 (PEM 格式)
function generateRSAKeyPair() {
    return new Promise((resolve, reject) => {
        forge.pki.rsa.generateKeyPair({ bits: 2048, workers: -1 }, (err, keypair) => {
            if (err) return reject(err);
            const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
            const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);
            resolve({ privateKeyPem, publicKeyPem });
        });
    });
}

/**
 * 获取虚拟令牌列表
 */
router.get('/', async (req, res) => {
    try {
        const { user_id, type, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT t.*, u.username 
            FROM sys_virtual_tokens t
            JOIN sys_users u ON t.user_id = u.id
            WHERE 1=1
        `;
        let params = [];
        
        if (user_id) {
            query += " AND t.user_id = ?";
            params.push(user_id);
        }
        if (type) {
            query += " AND t.type = ?";
            params.push(type);
        }
        
        query += " ORDER BY t.id DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), offset);
        
        const [tokens] = await db.query(query, params);
        
        if (tokens.length > 0) {
            const tokenIds = tokens.map(t => t.id);
            // 批量查询路由信息，避免 N+1 问题
            const [allRoutes] = await db.query(`
                SELECT r.virtual_token_id, r.channel_id, r.weight, c.name as channel_name 
                FROM sys_token_routes r
                JOIN sys_channels c ON r.channel_id = c.id
                WHERE r.virtual_token_id IN (?)
            `, [tokenIds]);

            // 内存组装
            const routesMap = {};
            allRoutes.forEach(r => {
                if (!routesMap[r.virtual_token_id]) routesMap[r.virtual_token_id] = [];
                routesMap[r.virtual_token_id].push(r);
            });

            for (const token of tokens) {
                token.routes = routesMap[token.id] || [];
                delete token.token_secret; 
            }
        }
        
        res.json({ data: tokens });
    } catch (err) {
        logger.error('List tokens failed:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 创建虚拟令牌
 */
router.post('/', async (req, res) => {
    const { user_id, name, type, routes, limit_config } = req.body;
    // routes: [{ channel_id: 1, weight: 80 }, ...]
    
    if (!user_id || !type || !routes || routes.length === 0) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    // [Added] Check name uniqueness
    if (name) {
        const [existing] = await db.query("SELECT id FROM sys_virtual_tokens WHERE name = ?", [name]);
        if (existing.length > 0) {
            return res.status(400).json({ error: `Token name '${name}' already exists. Please use a unique name.` });
        }
    }
    
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        let token_key = "";
        let token_secret = null;
        let public_key = null;
        let download_payload = null; // 返回给前端下载的内容
        
        if (type === 'vertex') {
            // 生成 RSA 密钥对
            const keys = await generateRSAKeyPair();
            token_secret = keys.privateKeyPem;
            public_key = keys.publicKeyPem;
            
            // 生成唯一的 client_email
            const uniqueId = uuidv4().replace(/-/g, '').substring(0, 12);
            token_key = `service-account-${uniqueId}@virtual-project.iam.gserviceaccount.com`;
            
            // 构造 Vertex JSON
            const domain = process.env.DOMAIN_NAME || 'localhost:8888';
            const baseUrl = `http://${domain}`; // 使用 http 还是 https 取决于 Nginx 是否配了 SSL，这里假设 http 或由 Nginx 处理跳转
            // 如果是生产环境，建议在 .env 里 DOMAIN_NAME 直接带协议，或者这里判断
            // 简单起见，我们统一用 https (如果客户端支持自动降级最好，否则需要 Nginx 配 SSL)
            // 为了兼容性，我们用 http 除非确定有证书。或者让用户在 .env 里配 PROTOCOL
            
            // 修正：Vertex SDK 通常要求 https。如果您的 8888 端口是 HTTP，可能会报错。
            // 但为了先跑通，我们用 http://47.239.10.174:8888
            const protocol = 'http'; 

            download_payload = {
                type: "service_account",
                project_id: "virtual-project",
                private_key_id: uuidv4().replace(/-/g, ''),
                private_key: token_secret,
                client_email: token_key,
                client_id: "1" + Math.random().toString().substring(2, 20),
                auth_uri: `${protocol}://${domain}/accounts.google.com/o/oauth2/auth`,
                token_uri: `${protocol}://${domain}/oauth2.googleapis.com/token`,
                auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                client_x509_cert_url: `${protocol}://${domain}/www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(token_key)}`
            };
            
        } else {
            // Azure / OpenAI: 生成随机 sk-
            token_key = "sk-virt-" + uuidv4().replace(/-/g, '');
            download_payload = { api_key: token_key };
        }
        
        // 1. 插入 Tokens 表
        const [resToken] = await connection.query(
            "INSERT INTO sys_virtual_tokens (user_id, name, type, token_key, token_secret, public_key, limit_config, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [user_id, name, type, token_key, token_secret, public_key, JSON.stringify(limit_config || {}), req.body.expires_at || null]
        );
        const tokenId = resToken.insertId;
        
        // 2. 插入 Routes 表
        for (const route of routes) {
            await connection.query(
                "INSERT INTO sys_token_routes (virtual_token_id, channel_id, weight) VALUES (?, ?, ?)",
                [tokenId, route.channel_id, route.weight || 10]
            );
        }
        
        await connection.commit();
        
        // 3. 触发 Redis 同步 (使用非事务连接)
        const [newToken] = await db.query("SELECT * FROM sys_virtual_tokens WHERE id = ?", [tokenId]);
        await SyncManager.updateVirtualTokenCache(newToken[0]);
        
        res.status(201).json({ 
            id: tokenId, 
            message: "Token created successfully",
            credentials: download_payload // 仅此一次返回完整凭证
        });
        
    } catch (err) {
        await connection.rollback();
        logger.error('Create token failed:', err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

/**
 * 更新令牌 (状态、路由、配置)
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { status, name, expires_at, routes, limit_config } = req.body;
    
    // [Added] Check name uniqueness
    if (name) {
        const [existing] = await db.query("SELECT id FROM sys_virtual_tokens WHERE name = ? AND id != ?", [name, id]);
        if (existing.length > 0) {
            return res.status(400).json({ error: `Token name '${name}' already exists.` });
        }
    }
    
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. 更新基本信息
        let updateFields = [];
        let params = [];
        if (status !== undefined) { updateFields.push("status = ?"); params.push(status); }
        if (name !== undefined) { updateFields.push("name = ?"); params.push(name); }
        if (expires_at !== undefined) { updateFields.push("expires_at = ?"); params.push(expires_at || null); }
        if (limit_config !== undefined) { updateFields.push("limit_config = ?"); params.push(JSON.stringify(limit_config)); }
        
        if (updateFields.length > 0) {
            params.push(id);
            await connection.query(`UPDATE sys_virtual_tokens SET ${updateFields.join(", ")} WHERE id = ?`, params);
        }

        // 2. 更新路由 (先删后加)
        if (routes) {
            await connection.query("DELETE FROM sys_token_routes WHERE virtual_token_id = ?", [id]);
            for (const route of routes) {
                await connection.query(
                    "INSERT INTO sys_token_routes (virtual_token_id, channel_id, weight) VALUES (?, ?, ?)",
                    [id, route.channel_id, route.weight || 10]
                );
            }
        }

        await connection.commit();

        // 3. 同步缓存
        const [token] = await db.query("SELECT * FROM sys_virtual_tokens WHERE id = ?", [id]);
        if (token.length > 0) {
            await SyncManager.updateVirtualTokenCache(token[0]);
        }

        res.json({ message: "Token updated successfully" });

    } catch (err) {
        await connection.rollback();
        logger.error('Update token failed:', err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

/**
 * 删除令牌
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // 1. 先获取 Token 信息
        const [tokens] = await db.query("SELECT * FROM sys_virtual_tokens WHERE id = ?", [id]);
        if (tokens.length === 0) return res.json({ message: "Token not found" });
        const token = tokens[0];

        // 2. 关键：先尝试删除 Redis 缓存
        // 如果这一步失败（抛出异常），程序会跳到 catch，数据库不会被删除
        // 从而保证了“缓存不删，数据不丢”的一致性原则
        try {
            await SyncManager.deleteTokenCache(token);
        } catch (redisErr) {
            logger.error(`[Critical] Failed to delete token cache for ${id}: ${redisErr.message}`);
            // 策略选择：
            // A. 强一致性：直接报错返回，不允许删除 DB
            return res.status(500).json({ error: "Critical Error: Failed to sync with Redis. Delete aborted to prevent leakage." });
            
            // B. 最终一致性：继续删除 DB，但记录严重报警 (不推荐用于资损场景)
        }

        // 3. 缓存删除成功后，再删除 DB 记录
        await db.query("DELETE FROM sys_virtual_tokens WHERE id = ?", [id]);

        res.json({ message: "Token deleted successfully" });
    } catch (err) {
        logger.error('Delete token failed:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 验证令牌 (Dry Run)
 */
router.post('/:id/verify', async (req, res) => {
    const { id } = req.params;
    try {
        const [tokens] = await db.query(`
            SELECT t.*, u.status as user_status 
            FROM sys_virtual_tokens t
            JOIN sys_users u ON t.user_id = u.id
            WHERE t.id = ?
        `, [id]);

        if (tokens.length === 0) return res.status(404).json({ error: "Token not found" });
        const token = tokens[0];

        const checks = [];

        // 1. 基础状态检查
        if (token.status !== 1) checks.push("❌ Token is Disabled");
        else checks.push("✅ Token Status: Active");

        if (token.user_status !== 1) checks.push("❌ User is Disabled");
        else checks.push("✅ User Status: Active");

        // 2. 路由检查
        const [routes] = await db.query("SELECT * FROM sys_token_routes WHERE virtual_token_id = ?", [id]);
        if (routes.length === 0) checks.push("❌ No Routes Configured");
        else {
            checks.push(`✅ Routes: ${routes.length} channel(s) bound`);
            // 检查渠道状态
            for (const r of routes) {
                const [ch] = await db.query("SELECT status, name FROM sys_channels WHERE id = ?", [r.channel_id]);
                if (!ch.length || ch[0].status !== 1) {
                    checks.push(`⚠️ Channel [${r.channel_id}] is Invalid/Disabled`);
                } else {
                    checks.push(`✅ Channel [${ch[0].name}] is Active`);
                }
            }
        }

const axios = require('axios'); // Ensure axios is available

// ... inside router.post('/:id/verify' ...

        // 3. 类型特定检查
        if (token.type === 'vertex') {
            if (token.token_secret && token.public_key) {
                checks.push("✅ RSA Key Pair: Present");
                
                try {
                    const jwt = require('jsonwebtoken');
                    const tokenUri = `http://localhost:${process.env.PORT || 8889}/accounts.google.com/oauth2/token`;
                    
                    // 1. 生成真实 JWT
                    const now = Math.floor(Date.now() / 1000);
                    const payload = {
                        iss: token.token_key, // client_email
                        scope: "https://www.googleapis.com/auth/cloud-platform",
                        aud: tokenUri, // 这里的 aud 其实 mock 服务不强校验，但最好写对
                        exp: now + 3600,
                        iat: now
                    };
                    const assertion = jwt.sign(payload, token.token_secret, { algorithm: 'RS256' });
                    
                    // 2. 发起真实 HTTP 请求 (模拟客户端)
                    checks.push(`ℹ️ Attempting Mock Auth Request...`);
                    
                    const res = await axios.post(tokenUri, {
                        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                        assertion: assertion
                    });
                    
                    if (res.data.access_token) {
                        checks.push(`✅ Full Auth Flow: SUCCESS`);
                        checks.push(`   -> Generated Token: ${res.data.access_token.substring(0, 15)}...`);
                        checks.push(`   -> Redis Cache: Written (Expires in ${res.data.expires_in}s)`);
                    } else {
                        checks.push(`❌ Full Auth Flow: Failed (No token returned)`);
                    }

                } catch (e) {
                    const errDetail = e.response?.data?.error_description || e.message;
                    checks.push(`❌ Full Auth Flow: Failed (${errDetail})`);
                    if (e.code === 'ECONNREFUSED') {
                        checks.push(`   -> Hint: Service might not be listening on localhost:${process.env.PORT || 8889}`);
                    }
                }
            } else {
                checks.push("❌ RSA Key Pair: Missing/Corrupted");
            }
        } else {
            // OpenAI: 检查 Redis
            const exists = await SyncManager.redis.exists(`apikey:${token.token_key}`); // RedisService 自动加前缀? 不，它不加。
            // 我们的 RedisService 已经去掉了自动前缀。
            // SyncManager 在写入时是：set(`apikey:${token.token_key}`)
            // 这里的 exists 方法：const fullKey = this.config.keyPrefix + key; (RedisService.js)
            // 所以我们应该传 `apikey:${token.token_key}`。
            
            if (exists) checks.push("✅ Redis Cache: Present");
            else checks.push("❌ Redis Cache: MISSING (Try saving token again)");
        }

        const success = !checks.some(c => c.startsWith('❌'));
        res.json({ success, messages: checks });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
