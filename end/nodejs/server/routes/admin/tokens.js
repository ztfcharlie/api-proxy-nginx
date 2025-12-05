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
        
        // 统计总数
        // (省略 total 查询以简化代码，实际项目应加上)
        
        // 补充路由信息
        for (const token of tokens) {
            const [routes] = await db.query(`
                SELECT r.channel_id, r.weight, c.name as channel_name 
                FROM sys_token_routes r
                JOIN sys_channels c ON r.channel_id = c.id
                WHERE r.virtual_token_id = ?
            `, [token.id]);
            token.routes = routes;
            
            // 移除私钥，避免泄露 (私钥只在创建时返回一次，或者下载时返回)
            delete token.token_secret; 
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
            download_payload = {
                type: "service_account",
                project_id: "virtual-project",
                private_key_id: uuidv4().replace(/-/g, ''),
                private_key: token_secret,
                client_email: token_key,
                client_id: "1" + Math.random().toString().substring(2, 20),
                auth_uri: "https://accounts.google.com/o/oauth2/auth",
                // 关键：Token URI 指向我们的代理
                token_uri: `https://${process.env.DOMAIN_NAME || 'localhost:8888'}/accounts.google.com/oauth2/token`,
                auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(token_key)}`
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
 * 更新令牌 (主要用于状态切换)
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    try {
        if (status !== undefined) {
            await db.query("UPDATE sys_virtual_tokens SET status = ? WHERE id = ?", [status, id]);
            
            // 触发缓存同步
            const [token] = await db.query("SELECT * FROM sys_virtual_tokens WHERE id = ?", [id]);
            await SyncManager.updateVirtualTokenCache(token[0]);
            
            return res.json({ message: "Token status updated" });
        }
        res.json({ message: "No changes" });
    } catch (err) {
        logger.error('Update token failed:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
