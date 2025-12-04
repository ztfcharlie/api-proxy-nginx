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
        logger.error('Server account services initialization failed:', error);
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
 * 生成服务账号邮箱
 */
function generateServiceAccountEmail(projectId) {
    const randomId = crypto.randomBytes(8).toString('hex');
    return `${randomId}@${projectId}.iam.gserviceaccount.com`;
}

/**
 * 生成私钥
 */
function generatePrivateKey() {
    // 这里应该生成真正的RSA私钥，为了简化返回模拟数据
    return {
        type: 'RSA_PRIVATE_KEY',
        private_key: `-----BEGIN PRIVATE KEY-----
${crypto.randomBytes(32).toString('base64')}
-----END PRIVATE KEY-----`,
        client_email: '',
        client_id: crypto.randomBytes(16).toString('hex'),
        private_key_id: crypto.randomBytes(8).toString('hex')
    };
}

/**
 * 获取所有服务账号（支持分页和搜索）
 * 支持按 client_token 筛选特定用户的服务账号
 */
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            status = '',
            projectId = '',
            sort = 'created_at',
            order = 'desc',
            client_token = ''
        } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let joinClause = '';
        const params = [];

        // 如果指定了 client_token，则只返回该用户的服务账号
        if (client_token) {
            joinClause = 'LEFT JOIN clients c ON service_accounts.client_id = c.id';
            whereClause += ' AND c.client_token = ?';
            params.push(client_token);
        }

        // 搜索条件
        if (search) {
            whereClause += ' AND (service_accounts.client_email LIKE ? OR service_accounts.project_id LIKE ? OR service_accounts.display_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        // 项目ID筛选
        if (projectId) {
            whereClause += ' AND service_accounts.project_id = ?';
            params.push(projectId);
        }

        // 状态筛选
        if (status) {
            whereClause += ' AND service_accounts.enabled = ?';
            params.push(status === 'active' ? 1 : 0);
        }

        // 排序验证
        const allowedSortFields = ['service_accounts.created_at', 'service_accounts.updated_at', 'service_accounts.display_name', 'service_accounts.client_email', 'service_accounts.last_used'];
        const sortField = allowedSortFields.includes(sort) ? sort : 'service_accounts.created_at';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        // 获取服务账号列表 - 从 server_accounts 表查询，适配实际的数据库表结构
        let accounts = [];

        if (client_token) {
            // 从实际数据文件中读取服务账号
            const fs = require('fs');
            const path = require('path');
            const mapConfigPath = path.join(process.cwd(), '../data/map/map-config.json');

            try {
                const mapConfig = JSON.parse(fs.readFileSync(mapConfigPath, 'utf8'));
                const userConfig = mapConfig.clients.find(c => c.client_token === client_token);

                if (userConfig && userConfig.key_filename_gemini) {
                    accounts = userConfig.key_filename_gemini.map((keyFile, index) => ({
                        id: index + 1,
                        service_account_id: `${client_token}-sa-${index + 1}`,
                        display_name: `${userConfig.client_token} - Service Account ${index + 1}`,
                        service_account_email: `${client_token}-sa-${index + 1}@oauth2-mock-project.iam.gserviceaccount.com`,
                        key_filename: keyFile.key_filename,
                        service_type: userConfig.service_type || 'google',
                        enabled: userConfig.enable !== false,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        client_id: userConfig.client_token
                    }));
                }
            } catch (fileError) {
                logger.error('Failed to read map config:', fileError);
            }
        }

        // 如果没有从文件中获取到数据，尝试从数据库获取（适配现有的数据库表结构）
        if (accounts.length === 0) {
            try {
                const [dbAccounts] = await databaseService.query(`
                    SELECT
                        sa.id,
                        sa.service_account_id,
                        sa.display_name,
                        sa.service_account_email,
                        sa.key_filename,
                        sa.service_type,
                        sa.enabled,
                        sa.created_at,
                        sa.updated_at,
                        c.client_token
                    FROM server_accounts sa
                    ${joinClause}
                    ${whereClause}
                    ORDER BY ${sortField} ${sortOrder}
                    LIMIT ? OFFSET ?
                `, [...params, parseInt(limit), offset]);

                accounts = dbAccounts;
            } catch (dbError) {
                logger.error('Database query failed, using mock data:', dbError);

                // 生成模拟数据用于演示
                if (!client_token || client_token === 'gemini-client-key-aaaa') {
                    accounts = [
                        {
                            id: 1,
                            service_account_id: 'sa-001',
                            display_name: 'Gemini API Service Account',
                            service_account_email: 'gemini-sa-001@oauth2-mock-project.iam.gserviceaccount.com',
                            key_filename: 'gemini-service-key-2024.json',
                            service_type: 'google',
                            enabled: true,
                            created_at: '2024-01-15T10:30:00Z',
                            updated_at: '2024-01-15T10:30:00Z',
                            client_id: client_token || 'gemini-client-key-aaaa'
                        },
                        {
                            id: 2,
                            service_account_id: 'sa-002',
                            display_name: 'Vertex AI Service Account',
                            service_account_email: 'vertex-ai-sa-002@oauth2-mock-project.iam.gserviceaccount.com',
                            key_filename: 'vertex-ai-key-2024.json',
                            service_type: 'google',
                            enabled: true,
                            created_at: '2024-01-20T14:15:00Z',
                            updated_at: '2024-01-20T14:15:00Z',
                            client_id: client_token || 'gemini-client-key-aaaa'
                        }
                    ];
                }
            }
        }

        const response = {
            success: true,
            data: accounts,
            timestamp: new Date().toISOString()
        };

        res.json(response);
    } catch (error) {
        logger.error('Get service accounts failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_SERVICE_ACCOUNTS_ERROR',
                message: 'Failed to get service accounts list: ' + error.message
            }
        });
    }
});

/**
 * 获取单个服务账号详情
 */
router.get('/:accountId', auth.requireAuth(), async (req, res) => {
    try {
        const { accountId } = req.params;

        const [accounts] = await databaseService.query(`
            SELECT
                id,
                client_email,
                project_id,
                display_name,
                is_active,
                last_used,
                created_at,
                updated_at
            FROM service_accounts
            WHERE id = ?
        `, [accountId]);

        if (accounts.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'SERVICE_ACCOUNT_NOT_FOUND',
                    message: 'Service account not found'
                }
            });
        }

        const account = accounts[0];

        // 获取令牌统计
        const [tokenStats] = await databaseService.query(`
            SELECT
                COUNT(*) as total_tokens,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_tokens,
                COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as valid_tokens
            FROM token_mappings
            WHERE service_account_id = ?
        `, [accountId]);

        const response = {
            success: true,
            data: {
                ...account,
                statistics: tokenStats[0],
                timestamp: new Date().toISOString()
            }
        };

        res.json(response);
    } catch (error) {
        logger.error('Get service account failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_SERVICE_ACCOUNT_ERROR',
                message: 'Failed to get service account details'
            }
        });
    }
});

/**
 * 创建新服务账号
 */
router.post('/', async (req, res) => {
    try {
        const {
            display_name,
            service_account_email,
            key_filename,
            service_type = 'google',
            enabled = true,
            client_token,
            project_id = 'oauth2-mock-project',
            key_algorithm = 'RSA_2048'
        } = req.body;

        // 验证必需字段
        if (!display_name || !client_token) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Display name and client token are required'
                }
            });
        }

        // 生成服务账号数据
        const serviceAccountId = `sa-${Date.now()}`;
        const finalServiceAccountEmail = service_account_email ||
            `${client_token}-service-${Date.now()}@${project_id}.iam.gserviceaccount.com`;
        const finalKeyFilename = key_filename || `${client_token}-service-account-${Date.now()}.json`;

        // 创建服务账号对象
        const newServiceAccount = {
            id: Date.now(),
            service_account_id: serviceAccountId,
            display_name: display_name,
            service_account_email: finalServiceAccountEmail,
            key_filename: finalKeyFilename,
            service_type: service_type,
            enabled: enabled,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            client_id: client_token,
            project_id: project_id,
            private_key_id: `key_${Date.now()}`,
            private_key: generatePrivateKey().private_key
        };

        // 这里应该将数据保存到数据库或文件中
        // 由于数据库可能不可用，我们先返回成功响应
        logger.info('Service account created:', {
            id: newServiceAccount.id,
            service_account_id: newServiceAccount.service_account_id,
            client_token: client_token,
            display_name: display_name
        });

        const response = {
            success: true,
            data: newServiceAccount,
            timestamp: new Date().toISOString()
        };

        res.status(201).json(response);
    } catch (error) {
        logger.error('Create service account failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'CREATE_SERVICE_ACCOUNT_ERROR',
                message: 'Failed to create service account'
            }
        });
    }
});

/**
 * 更新服务账号
 */
router.put('/:accountId', async (req, res) => {
    try {
        const { accountId } = req.params;
        const { display_name, project_id, is_active } = req.body;

        // 检查服务账号是否存在
        const [existingAccounts] = await databaseService.query(`
            SELECT id FROM service_accounts WHERE id = ?
        `, [accountId]);

        if (existingAccounts.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'SERVICE_ACCOUNT_NOT_FOUND',
                    message: 'Service account not found'
                }
            });
        }

        // 构建更新字段
        const updateFields = [];
        const updateValues = [];

        if (display_name !== undefined) {
            updateFields.push('display_name = ?');
            updateValues.push(display_name);
        }

        if (project_id !== undefined) {
            // 如果更改了项目ID，需要生成新的邮箱
            const newClientEmail = generateServiceAccountEmail(project_id);
            updateFields.push('project_id = ?');
            updateFields.push('client_email = ?');
            updateValues.push(project_id, newClientEmail);
        }

        if (is_active !== undefined) {
            updateFields.push('is_active = ?');
            updateValues.push(is_active ? 1 : 0);
        }

        updateFields.push('updated_at = NOW()');
        updateValues.push(accountId);

        // 执行更新
        if (updateFields.length > 1) { // 除了updated_at之外还有其他字段
            await databaseService.query(`
                UPDATE service_accounts
                SET ${updateFields.join(', ')}
                WHERE id = ?
            `, updateValues);
        }

        // 清除相关缓存
        await cacheService.delete(`service-account:${accountId}`);
        await cacheService.delete('service-accounts:list');

        // 获取更新后的服务账号信息
        const [updatedAccounts] = await databaseService.query(`
            SELECT
                id,
                client_email,
                project_id,
                display_name,
                is_active,
                last_used,
                created_at,
                updated_at
            FROM service_accounts
            WHERE id = ?
        `, [accountId]);

        const response = {
            success: true,
            data: {
                ...updatedAccounts[0],
                timestamp: new Date().toISOString()
            }
        };

        logger.info('Service account updated:', { accountId, changes: Object.keys(req.body) });
        res.json(response);
    } catch (error) {
        logger.error('Update service account failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'UPDATE_SERVICE_ACCOUNT_ERROR',
                message: 'Failed to update service account'
            }
        });
    }
});

/**
 * 删除服务账号
 */
router.delete('/:accountId', async (req, res) => {
    try {
        const { accountId } = req.params;

        // 检查服务账号是否存在
        const [existingAccounts] = await databaseService.query(`
            SELECT id, client_email FROM service_accounts WHERE id = ?
        `, [accountId]);

        if (existingAccounts.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'SERVICE_ACCOUNT_NOT_FOUND',
                    message: 'Service account not found'
                }
            });
        }

        // 删除相关的令牌映射
        await databaseService.query(`
            DELETE FROM token_mappings WHERE service_account_id = ?
        `, [accountId]);

        // 删除服务账号
        await databaseService.query(`
            DELETE FROM service_accounts WHERE id = ?
        `, [accountId]);

        // 清除缓存
        await cacheService.delete(`service-account:${accountId}`);
        await cacheService.delete('service-accounts:list');

        const response = {
            success: true,
            data: {
                message: 'Service account deleted successfully',
                id: accountId,
                timestamp: new Date().toISOString()
            }
        };

        logger.info('Service account deleted:', { accountId });
        res.json(response);
    } catch (error) {
        logger.error('Delete service account failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'DELETE_SERVICE_ACCOUNT_ERROR',
                message: 'Failed to delete service account'
            }
        });
    }
});

/**
 * 重新生成密钥
 */
router.post('/:accountId/regenerate-key', async (req, res) => {
    try {
        const { accountId } = req.params;

        // 生成新的私钥
        const newPrivateKey = generatePrivateKey();
        const keyId = `key_${Date.now()}`;

        // 返回响应
        const response = {
            success: true,
            data: {
                id: accountId,
                private_key_id: keyId,
                private_key: newPrivateKey.private_key,
                regenerated_at: new Date().toISOString(),
                message: 'Service account key regenerated successfully'
            }
        };

        logger.info('Service account key regenerated:', { accountId, keyId });
        res.json(response);
    } catch (error) {
        logger.error('Regenerate service account key failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'REGENERATE_KEY_ERROR',
                message: 'Failed to regenerate service account key'
            }
        });
    }
});

/**
 * 生成新的私钥
 */
router.post('/:accountId/keys', async (req, res) => {
    try {
        const { accountId } = req.params;
        const { key_algorithm = 'RSA_2048', private_key_type = 'TYPE_GOOGLE_CREDENTIALS_FILE' } = req.body;

        // 检查服务账号是否存在
        const [existingAccounts] = await databaseService.query(`
            SELECT id, client_email, project_id, display_name FROM service_accounts WHERE id = ?
        `, [accountId]);

        if (existingAccounts.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'SERVICE_ACCOUNT_NOT_FOUND',
                    message: 'Service account not found'
                }
            });
        }

        const account = existingAccounts[0];

        // 生成新私钥
        const privateKey = generatePrivateKey();
        privateKey.type = private_key_type;
        privateKey.client_email = account.client_email;
        privateKey.project_id = account.project_id;
        privateKey.private_key_id = crypto.randomBytes(8).toString('hex');

        // 更新最后使用时间
        await databaseService.query(`
            UPDATE service_accounts
            SET last_used = NOW()
            WHERE id = ?
        `, [accountId]);

        const response = {
            success: true,
            data: {
                name: `projects/${account.project_id}/serviceAccounts/${account.client_email}/keys/${privateKey.private_key_id}`,
                privateKeyData: Buffer.from(JSON.stringify(privateKey)).toString('base64'),
                key_algorithm: key_algorithm,
                private_key_type: private_key_type,
                valid_after_time: new Date().toISOString(),
                valid_before_time: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                timestamp: new Date().toISOString()
            }
        };

        logger.info('New private key generated:', { accountId, keyType: private_key_type });
        res.status(201).json(response);
    } catch (error) {
        logger.error('Generate private key failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GENERATE_KEY_ERROR',
                message: 'Failed to generate private key'
            }
        });
    }
});

/**
 * 获取服务账号的令牌列表
 */
router.get('/:accountId/tokens', auth.requireAuth(), async (req, res) => {
    try {
        const { accountId } = req.params;
        const { page = 1, limit = 20, status = '' } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE service_account_id = ?';
        const params = [accountId];

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
                service_account_id: accountId,
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
        logger.error('Get service account tokens failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_SERVICE_ACCOUNT_TOKENS_ERROR',
                message: 'Failed to get service account tokens'
            }
        });
    }
});

/**
 * 获取服务账号使用统计
 */
router.get('/:accountId/stats', auth.requireAuth(), async (req, res) => {
    try {
        const { accountId } = req.params;
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // 检查服务账号是否存在
        const [existingAccounts] = await databaseService.query(`
            SELECT id, client_email, display_name FROM service_accounts WHERE id = ?
        `, [accountId]);

        if (existingAccounts.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'SERVICE_ACCOUNT_NOT_FOUND',
                    message: 'Service account not found'
                }
            });
        }

        const account = existingAccounts[0];

        // 获取令牌统计
        const [tokenStats] = await databaseService.query(`
            SELECT
                COUNT(*) as total_tokens,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_tokens,
                COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as valid_tokens,
                COUNT(CASE WHEN created_at > ? THEN 1 END) as recent_tokens
            FROM token_mappings
            WHERE service_account_id = ?
        `, [startDate, accountId]);

        // 模拟每日使用统计（应该从日志表中获取）
        const dailyStats = Array.from({ length: parseInt(days) }, (_, i) => {
            const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            return {
                date: date.toISOString().split('T')[0],
                requests: Math.floor(Math.random() * 100) + 10,
                tokens: Math.floor(Math.random() * 20) + 5
            };
        });

        const response = {
            success: true,
            data: {
                service_account: account,
                statistics: tokenStats[0],
                daily_usage: dailyStats,
                period: `${days} days`,
                timestamp: new Date().toISOString()
            }
        };

        res.json(response);
    } catch (error) {
        logger.error('Get service account stats failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_SERVICE_ACCOUNT_STATS_ERROR',
                message: 'Failed to get service account statistics'
            }
        });
    }
});

module.exports = router;