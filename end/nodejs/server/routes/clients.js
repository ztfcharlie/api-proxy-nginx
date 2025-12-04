const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const LoggerService = require('../services/LoggerService');
const authMiddleware = require('../middleware/auth');
const DatabaseService = require('../services/DatabaseService');
const { CacheService } = require('../services/CacheService');

const router = express.Router();
const logger = LoggerService;
const auth = authMiddleware;

// 服务实例
let databaseService = null;
let cacheService = null;

// 初始化服务
async function initializeServices() {
    if (!databaseService) {
        databaseService = new DatabaseService();
        await databaseService.initialize();
    }
    if (!cacheService) {
        cacheService = new CacheService();
        await cacheService.initialize();
    }
}

// 中间件：确保服务已初始化
router.use(async (req, res, next) => {
    try {
        await initializeServices();
        next();
    } catch (error) {
        logger.error('Client services initialization failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'SERVICE_INITIALIZATION_ERROR',
                message: 'Internal server error'
            }
        });
    }
});

/**
 * 生成客户端ID
 */
function generateClientId() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * 生成客户端密钥
 */
function generateClientSecret() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * 获取所有客户端（支持分页和搜索）
 */
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', status = '', sort = 'created_at', order = 'desc' } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];

        // 搜索条件
        if (search) {
            whereClause += ' AND (client_name LIKE ? OR client_id LIKE ? OR description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        // 状态筛选
        if (status) {
            whereClause += ' AND is_active = ?';
            params.push(status === 'active' ? 1 : 0);
        }

        // 排序验证
        const allowedSortFields = ['created_at', 'updated_at', 'client_name', 'client_id'];
        const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        let clients = [];

        // 从配置文件读取客户端数据
        const fs = require('fs');
        const path = require('path');
        
        // 尝试查找配置文件的多个可能位置
        // 1. Docker 环境: /app/map/map-config.json (process.cwd() is /app)
        // 2. 本地开发环境: ../data/map/map-config.json (relative to nodejs folder)
        const possiblePaths = [
            path.join(process.cwd(), 'map/map-config.json'),
            path.join(process.cwd(), '../data/map/map-config.json')
        ];

        let mapConfigPath = null;
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                mapConfigPath = p;
                break;
            }
        }

        if (!mapConfigPath) {
            logger.error('Map config file not found in any of the expected locations:', possiblePaths);
            return res.status(500).json({
                success: false,
                error: {
                    code: 'CONFIG_FILE_NOT_FOUND',
                    message: 'map-config.json file not found'
                }
            });
        }

        const mapConfig = JSON.parse(fs.readFileSync(mapConfigPath, 'utf8'));

        clients = mapConfig.clients.map((client, index) => ({
            id: index + 1,
            client_id: client.client_token,
            client_name: client.client_token,
            description: `${client.service_type || 'google'} service client`,
            service_type: client.service_type || 'google',
            is_active: client.enable !== false,
            rate_limit: client.rate_limit || 1000,
            last_used: new Date().toISOString(),
            created_at: client.created_at || new Date().toISOString(),
            updated_at: client.updated_at || new Date().toISOString(),
            key_filename_gemini: client.key_filename_gemini || []
        }));

        // 应用搜索过滤
        if (search) {
            clients = clients.filter(client =>
                client.client_name.toLowerCase().includes(search.toLowerCase()) ||
                client.client_id.toLowerCase().includes(search.toLowerCase()) ||
                client.description.toLowerCase().includes(search.toLowerCase())
            );
        }

        // 应用状态过滤
        if (status) {
            const isActive = status === 'active';
            clients = clients.filter(client => client.is_active === isActive);
        }

        // 排序
        const finalSortOrder = order.toLowerCase() === 'asc' ? 1 : -1;

        clients.sort((a, b) => {
            if (a[sortField] < b[sortField]) return -finalSortOrder;
            if (a[sortField] > b[sortField]) return finalSortOrder;
            return 0;
        });

        // 分页
        const paginatedClients = clients.slice(offset, offset + parseInt(limit));

        const response = {
            success: true,
            data: paginatedClients,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: clients.length,
                pages: Math.ceil(clients.length / limit)
            },
            filters: {
                search,
                status,
                sort: sortField,
                order: sortOrder
            },
            timestamp: new Date().toISOString()
        };

        res.json(response);
    } catch (error) {
        logger.error('Get clients failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_CLIENTS_ERROR',
                message: 'Failed to get clients list: ' + error.message
            }
        });
    }
});

/**
 * 获取单个客户端详情
 */
router.get('/:clientId', auth.requireAuth(), async (req, res) => {
    try {
        const { clientId } = req.params;

        const [clients] = await databaseService.query(`
            SELECT
                client_id,
                client_name,
                description,
                redirect_uris,
                is_active,
                created_at,
                updated_at
            FROM clients
            WHERE client_id = ?
        `, [clientId]);

        if (clients.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'CLIENT_NOT_FOUND',
                    message: 'Client not found'
                }
            });
        }

        const client = clients[0];
        client.redirect_uris = JSON.parse(client.redirect_uris || '[]');

        // 获取客户端的令牌统计
        const [tokenStats] = await databaseService.query(`
            SELECT
                COUNT(*) as total_tokens,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_tokens,
                COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as valid_tokens
            FROM token_mappings
            WHERE client_token LIKE ?
        `, [`%${clientId}%`]);

        const response = {
            success: true,
            data: {
                ...client,
                statistics: tokenStats[0],
                timestamp: new Date().toISOString()
            }
        };

        res.json(response);
    } catch (error) {
        logger.error('Get client failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_CLIENT_ERROR',
                message: 'Failed to get client details'
            }
        });
    }
});

/**
 * 创建新客户端
 */
router.post('/', auth.requireAuth(), async (req, res) => {
    try {
        const { client_name, description, redirect_uris } = req.body;

        // 验证必需字段
        if (!client_name) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Client name is required'
                }
            });
        }

        // 验证重定向URI格式
        let parsedUris = [];
        if (redirect_uris) {
            if (Array.isArray(redirect_uris)) {
                parsedUris = redirect_uris;
            } else if (typeof redirect_uris === 'string') {
                try {
                    parsedUris = JSON.parse(redirect_uris);
                } catch (e) {
                    return res.status(400).json({
                        success: false,
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: 'Invalid redirect_uris format'
                        }
                    });
                }
            }
        }

        // 生成客户端ID和密钥
        const clientId = generateClientId();
        const clientSecret = generateClientSecret();

        // 插入数据库
        const [result] = await databaseService.query(`
            INSERT INTO clients (
                client_id, client_secret, client_name, description,
                redirect_uris, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
        `, [clientId, clientSecret, client_name, description || null, JSON.stringify(parsedUris)]);

        // 清除相关缓存
        await cacheService.delete('clients:list');

        const response = {
            success: true,
            data: {
                client_id: clientId,
                client_secret: clientSecret,
                client_name,
                description,
                redirect_uris: parsedUris,
                is_active: true,
                id: result.insertId,
                timestamp: new Date().toISOString()
            }
        };

        logger.info('Client created:', { clientId, client_name });
        res.status(201).json(response);
    } catch (error) {
        logger.error('Create client failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'CREATE_CLIENT_ERROR',
                message: 'Failed to create client'
            }
        });
    }
});

/**
 * 更新客户端
 */
router.put('/:clientId', auth.requireAuth(), async (req, res) => {
    try {
        const { clientId } = req.params;
        const { client_name, description, redirect_uris, is_active } = req.body;

        // 检查客户端是否存在
        const [existingClients] = await databaseService.query(`
            SELECT id FROM clients WHERE client_id = ?
        `, [clientId]);

        if (existingClients.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'CLIENT_NOT_FOUND',
                    message: 'Client not found'
                }
            });
        }

        // 构建更新字段
        const updateFields = [];
        const updateValues = [];

        if (client_name !== undefined) {
            updateFields.push('client_name = ?');
            updateValues.push(client_name);
        }

        if (description !== undefined) {
            updateFields.push('description = ?');
            updateValues.push(description);
        }

        if (redirect_uris !== undefined) {
            let parsedUris = [];
            if (Array.isArray(redirect_uris)) {
                parsedUris = redirect_uris;
            } else if (typeof redirect_uris === 'string') {
                try {
                    parsedUris = JSON.parse(redirect_uris);
                } catch (e) {
                    return res.status(400).json({
                        success: false,
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: 'Invalid redirect_uris format'
                        }
                    });
                }
            }
            updateFields.push('redirect_uris = ?');
            updateValues.push(JSON.stringify(parsedUris));
        }

        if (is_active !== undefined) {
            updateFields.push('is_active = ?');
            updateValues.push(is_active ? 1 : 0);
        }

        updateFields.push('updated_at = NOW()');
        updateValues.push(clientId);

        // 执行更新
        if (updateFields.length > 1) { // 除了updated_at之外还有其他字段
            await databaseService.query(`
                UPDATE clients
                SET ${updateFields.join(', ')}
                WHERE client_id = ?
            `, updateValues);
        }

        // 清除相关缓存
        await cacheService.delete(`client:${clientId}`);
        await cacheService.delete('clients:list');

        // 获取更新后的客户端信息
        const [updatedClients] = await databaseService.query(`
            SELECT
                client_id,
                client_name,
                description,
                redirect_uris,
                is_active,
                created_at,
                updated_at
            FROM clients
            WHERE client_id = ?
        `, [clientId]);

        const client = updatedClients[0];
        client.redirect_uris = JSON.parse(client.redirect_uris || '[]');

        const response = {
            success: true,
            data: {
                ...client,
                timestamp: new Date().toISOString()
            }
        };

        logger.info('Client updated:', { clientId, changes: Object.keys(req.body) });
        res.json(response);
    } catch (error) {
        logger.error('Update client failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'UPDATE_CLIENT_ERROR',
                message: 'Failed to update client'
            }
        });
    }
});

/**
 * 删除客户端
 */
router.delete('/:clientId', auth.requireAuth(), async (req, res) => {
    try {
        const { clientId } = req.params;

        // 检查客户端是否存在
        const [existingClients] = await databaseService.query(`
            SELECT id FROM clients WHERE client_id = ?
        `, [clientId]);

        if (existingClients.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'CLIENT_NOT_FOUND',
                    message: 'Client not found'
                }
            });
        }

        // 删除相关的令牌映射
        await databaseService.query(`
            DELETE FROM token_mappings WHERE client_token LIKE ?
        `, [`%${clientId}%`]);

        // 删除客户端
        await databaseService.query(`
            DELETE FROM clients WHERE client_id = ?
        `, [clientId]);

        // 清除缓存
        await cacheService.delete(`client:${clientId}`);
        await cacheService.delete('clients:list');

        const response = {
            success: true,
            data: {
                message: 'Client deleted successfully',
                client_id: clientId,
                timestamp: new Date().toISOString()
            }
        };

        logger.info('Client deleted:', { clientId });
        res.json(response);
    } catch (error) {
        logger.error('Delete client failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'DELETE_CLIENT_ERROR',
                message: 'Failed to delete client'
            }
        });
    }
});

/**
 * 重新生成客户端密钥
 */
router.post('/:clientId/rotate-secret', auth.requireAuth(), async (req, res) => {
    try {
        const { clientId } = req.params;

        // 检查客户端是否存在
        const [existingClients] = await databaseService.query(`
            SELECT id, client_name FROM clients WHERE client_id = ?
        `, [clientId]);

        if (existingClients.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'CLIENT_NOT_FOUND',
                    message: 'Client not found'
                }
            });
        }

        // 生成新的客户端密钥
        const newClientSecret = generateClientSecret();

        // 更新数据库
        await databaseService.query(`
            UPDATE clients
            SET client_secret = ?, updated_at = NOW()
            WHERE client_id = ?
        `, [newClientSecret, clientId]);

        // 清除缓存
        await cacheService.delete(`client:${clientId}`);

        const response = {
            success: true,
            data: {
                client_id: clientId,
                client_secret: newClientSecret,
                message: 'Client secret rotated successfully',
                timestamp: new Date().toISOString()
            }
        };

        logger.info('Client secret rotated:', { clientId });
        res.json(response);
    } catch (error) {
        logger.error('Rotate client secret failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'ROTATE_SECRET_ERROR',
                message: 'Failed to rotate client secret'
            }
        });
    }
});

/**
 * 获取客户端的令牌列表
 */
router.get('/:clientId/tokens', auth.requireAuth(), async (req, res) => {
    try {
        const { clientId } = req.params;
        const { page = 1, limit = 20, status = '' } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE client_token LIKE ?';
        const params = [`%${clientId}%`];

        if (status) {
            whereClause += ' AND status = ?';
            params.push(status);
        }

        // 获取令牌列表
        const [tokens] = await databaseService.query(`
            SELECT
                id,
                client_token,
                LEFT(google_access_token, 50) as google_access_token_preview,
                expires_at,
                status,
                cache_version,
                created_at,
                updated_at
            FROM token_mappings
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), offset]);

        // 获取总数
        const [countResult] = await databaseService.query(`
            SELECT COUNT(*) as total FROM token_mappings ${whereClause}
        `, params);

        const response = {
            success: true,
            data: {
                client_id: clientId,
                tokens: tokens.map(token => ({
                    ...token,
                    google_access_token_preview: token.google_access_token_preview + '...',
                    expires_in_seconds: Math.max(0, Math.floor((new Date(token.expires_at) - new Date()) / 1000))
                })),
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult[0].total,
                    pages: Math.ceil(countResult[0].total / limit)
                },
                timestamp: new Date().toISOString()
            }
        };

        res.json(response);
    } catch (error) {
        logger.error('Get client tokens failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_CLIENT_TOKENS_ERROR',
                message: 'Failed to get client tokens'
            }
        });
    }
});

module.exports = router;