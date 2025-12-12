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
        let { user_id, type, username, channel_id, search, page = 1, limit = 20 } = req.query;
        
        // [RBAC] Force user_id for non-admins
        if (req.user.role !== 'admin') {
            user_id = req.user.id;
            username = undefined; // Disable username search for users
        }

        const offset = (page - 1) * limit;
        
        let query = `
            SELECT DISTINCT t.*, u.username 
            FROM sys_virtual_tokens t
            JOIN sys_users u ON t.user_id = u.id
        `;
        let params = [];

        // Join routes if filtering by channel
        if (channel_id) {
            query += " JOIN sys_token_routes r ON t.id = r.virtual_token_id";
        }
        
        query += " WHERE 1=1";
        
        if (user_id) {
            query += " AND t.user_id = ?";
            params.push(user_id);
        }
        // ... (rest of query building) ...
        if (username) {
            query += " AND u.username LIKE ?";
            params.push(`%${username}%`);
        }
        if (type) {
            query += " AND t.type = ?";
            params.push(type);
        }
        if (channel_id) {
            query += " AND r.channel_id = ?";
            params.push(channel_id);
        }
        if (search) {
            query += " AND (t.name LIKE ? OR t.token_key LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }
        
        query += " ORDER BY t.id DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), offset);
        
        const [tokens] = await db.query(query, params);
        
        if (tokens.length > 0) {
            const tokenIds = tokens.map(t => t.id);
            const [allRoutes] = await db.query(`
                SELECT r.virtual_token_id, r.channel_id, r.weight, c.name as channel_name 
                FROM sys_token_routes r
                JOIN sys_channels c ON r.channel_id = c.id
                WHERE r.virtual_token_id IN (?)
            `, [tokenIds]);

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
    // [RBAC] Only admin can create tokens
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden: Only admins can create tokens" });
    }

    const { user_id, name, type, routes, limit_config } = req.body;
    // ... (rest of logic) ...
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
        let download_payload = null;
        
        if (type === 'vertex') {
            const keys = await generateRSAKeyPair();
            token_secret = keys.privateKeyPem;
            public_key = keys.publicKeyPem;
            const uniqueId = uuidv4().replace(/-/g, '').substring(0, 12);
            token_key = `service-account-${uniqueId}@virtual-project.iam.gserviceaccount.com`;
            const domain = process.env.DOMAIN_NAME || 'localhost:8888';
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
            token_key = "sk-virt-" + uuidv4().replace(/-/g, '');
            download_payload = { api_key: token_key };
        }
        
        const [resToken] = await connection.query(
            "INSERT INTO sys_virtual_tokens (user_id, name, type, token_key, token_secret, public_key, limit_config, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [user_id, name, type, token_key, token_secret, public_key, JSON.stringify(limit_config || {}), req.body.expires_at || null]
        );
        const tokenId = resToken.insertId;
        
        for (const route of routes) {
            await connection.query(
                "INSERT INTO sys_token_routes (virtual_token_id, channel_id, weight) VALUES (?, ?, ?)",
                [tokenId, route.channel_id, route.weight || 10]
            );
        }
        
        await connection.commit();
        const [newToken] = await db.query("SELECT * FROM sys_virtual_tokens WHERE id = ?", [tokenId]);
        await SyncManager.updateVirtualTokenCache(newToken[0]);
        
        res.status(201).json({ id: tokenId, message: "Token created successfully", credentials: download_payload });
        
    } catch (err) {
        await connection.rollback();
        logger.error('Create token failed:', err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

/**
 * 更新令牌
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { status, name, expires_at, routes, limit_config } = req.body;
    
    // [RBAC] Check ownership and permissions
    if (req.user.role !== 'admin') {
        const [t] = await db.query("SELECT user_id FROM sys_virtual_tokens WHERE id = ?", [id]);
        if (t.length === 0 || t[0].user_id !== req.user.id) {
            return res.status(403).json({ error: "Forbidden" });
        }
        // Users can ONLY change status
        if (name || expires_at || routes || limit_config) {
            return res.status(403).json({ error: "Users can only modify token status" });
        }
    }

    // Check name uniqueness (only if name provided)
    if (name) {
        const [existing] = await db.query("SELECT id FROM sys_virtual_tokens WHERE name = ? AND id != ?", [name, id]);
        if (existing.length > 0) return res.status(400).json({ error: `Token name '${name}' already exists.` });
    }
    
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

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

        // Update Routes (Admin Only)
        if (routes && req.user.role === 'admin') {
            await connection.query("DELETE FROM sys_token_routes WHERE virtual_token_id = ?", [id]);
            for (const route of routes) {
                await connection.query(
                    "INSERT INTO sys_token_routes (virtual_token_id, channel_id, weight) VALUES (?, ?, ?)",
                    [id, route.channel_id, route.weight || 10]
                );
            }
        }

        await connection.commit();
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
    // [RBAC] Only admin
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden: Only admins can delete tokens" });
    }

    const { id } = req.params;
    try {
        const [tokens] = await db.query("SELECT * FROM sys_virtual_tokens WHERE id = ?", [id]);
        if (tokens.length === 0) return res.json({ message: "Token not found" });
        const token = tokens[0];

        try {
            await SyncManager.deleteTokenCache(token);
        } catch (redisErr) {
            logger.error(`[Critical] Failed to delete token cache for ${id}: ${redisErr.message}`);
            return res.status(500).json({ error: "Critical Error: Failed to sync with Redis." });
        }

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
