const express = require('express');
const LoggerService = require('../services/LoggerService');
const authMiddleware = require('../middleware/auth');
const { DatabaseService } = require('../services/DatabaseService');
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
        logger.error('Admin services initialization failed:', error);
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
 * 获取系统状态
 */
router.get('/status', async (req, res) => {
    try {
        const startTime = Date.now();
        const requestId = req.requestId || require('crypto').randomBytes(16).toString('hex');

        // 获取数据库状态
        const dbStatus = await databaseService.healthCheck();

        // 获取缓存状态
        const cacheStats = cacheService.getStats();

        // 获取系统信息
        const systemInfo = {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            version: process.version,
            platform: process.platform,
            nodeVersion: process.versions.node,
            pid: process.pid
        };

        const response = {
            success: true,
            data: {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                requestId,
                services: {
                    database: {
                        connected: dbStatus.connected,
                        responseTime: dbStatus.responseTime || null,
                        lastCheck: dbStatus.timestamp || null
                    },
                    cache: {
                        connected: cacheStats.redisConnected,
                        hitRate: cacheStats.hitRate,
                        memoryCacheSize: cacheStats.memoryCacheSize,
                        totalRequests: cacheStats.hits + cacheStats.misses
                    }
                },
                system: systemInfo,
                performance: {
                    responseTime: Date.now() - startTime
                }
            }
        };

        res.json(response);
    } catch (error) {
        logger.error('Admin status check failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'STATUS_CHECK_ERROR',
                message: 'Failed to get system status'
            }
        });
    }
});

/**
 * 获取数据库统计信息
 */
router.get('/database/stats', async (req, res) => {
    try {
        const startTime = Date.now();

        // 获取表统计
        const [tableStats] = await databaseService.query(`
            SELECT
                table_name,
                table_rows,
                data_length,
                index_length,
                ROUND((data_length + index_length) / 1024 / 1024, 2) as size_mb
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
            ORDER BY (data_length + index_length) DESC
        `);

        // 获取客户端统计
        const [clientStats] = await databaseService.query(`
            SELECT
                COUNT(*) as total_clients,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_clients,
                COUNT(CASE WHEN created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as recent_clients
            FROM clients
        `);

        // 获取令牌映射统计
        const [tokenStats] = await databaseService.query(`
            SELECT
                COUNT(*) as total_tokens,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_tokens,
                COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as valid_tokens,
                COUNT(CASE WHEN created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as recent_tokens
            FROM token_mappings
        `);

        // 获取服务账号统计
        const [serviceAccountStats] = await databaseService.query(`
            SELECT
                COUNT(*) as total_accounts,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_accounts,
                COUNT(CASE WHEN last_used > DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as used_accounts
            FROM service_accounts
        `);

        const response = {
            success: true,
            data: {
                tables: tableStats,
                clients: clientStats[0],
                tokens: tokenStats[0],
                serviceAccounts: serviceAccountStats[0],
                performance: {
                    responseTime: Date.now() - startTime
                },
                timestamp: new Date().toISOString()
            }
        };

        res.json(response);
    } catch (error) {
        logger.error('Database stats check failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'DATABASE_STATS_ERROR',
                message: 'Failed to get database statistics'
            }
        });
    }
});

/**
 * 获取缓存统计信息
 */
router.get('/cache/stats', async (req, res) => {
    try {
        const stats = cacheService.getStats();

        const response = {
            success: true,
            data: {
                ...stats,
                timestamp: new Date().toISOString()
            }
        };

        res.json(response);
    } catch (error) {
        logger.error('Cache stats check failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'CACHE_STATS_ERROR',
                message: 'Failed to get cache statistics'
            }
        });
    }
});

/**
 * 清理缓存
 */
router.post('/cache/clear', async (req, res) => {
    try {
        const { pattern } = req.body;

        let cleared = false;
        if (pattern) {
            // 清理指定模式的缓存
            // 这里需要实现按模式清理的逻辑
            cleared = await cacheService.clear(); // 暂时清理所有
        } else {
            // 清理所有缓存
            cleared = await cacheService.clear();
        }

        const response = {
            success: true,
            data: {
                cleared,
                message: cleared ? 'Cache cleared successfully' : 'Failed to clear cache',
                timestamp: new Date().toISOString()
            }
        };

        res.json(response);
    } catch (error) {
        logger.error('Cache clear failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'CACHE_CLEAR_ERROR',
                message: 'Failed to clear cache'
            }
        });
    }
});

/**
 * 获取客户端列表
 */
router.get('/clients', async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', status = '' } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (search) {
            whereClause += ' AND (client_name LIKE ? OR client_id LIKE ? OR description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (status) {
            whereClause += ' AND is_active = ?';
            params.push(status === 'active' ? 1 : 0);
        }

        // 获取客户端列表
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
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), offset]);

        // 获取总数
        const [countResult] = await databaseService.query(`
            SELECT COUNT(*) as total FROM clients ${whereClause}
        `, params);

        const response = {
            success: true,
            data: {
                clients: clients.map(client => ({
                    ...client,
                    redirect_uris: JSON.parse(client.redirect_uris || '[]')
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
        logger.error('Get clients failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_CLIENTS_ERROR',
                message: 'Failed to get clients list'
            }
        });
    }
});

/**
 * 获取令牌映射列表
 */
router.get('/tokens', async (req, res) => {
    try {
        const { page = 1, limit = 20, status = '', clientId = '' } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (status) {
            whereClause += ' AND status = ?';
            params.push(status);
        }

        if (clientId) {
            whereClause += ' AND client_token LIKE ?';
            params.push(`%${clientId}%`);
        }

        // 获取令牌映射列表
        const [tokens] = await databaseService.query(`
            SELECT
                id,
                client_token,
                LEFT(google_access_token, 50) as google_access_token_preview,
                expires_at,
                status,
                cache_version,
                created_at,
                updated_at,
                CASE
                    WHEN expires_at > NOW() THEN 'valid'
                    WHEN expires_at <= NOW() THEN 'expired'
                END as validity_status
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
        logger.error('Get tokens failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_TOKENS_ERROR',
                message: 'Failed to get tokens list'
            }
        });
    }
});

/**
 * 获取服务账号列表
 */
router.get('/service-accounts', async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', status = '' } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (search) {
            whereClause += ' AND (client_email LIKE ? OR project_id LIKE ? OR display_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (status) {
            whereClause += ' AND is_active = ?';
            params.push(status === 'active' ? 1 : 0);
        }

        // 获取服务账号列表
        const [accounts] = await databaseService.query(`
            SELECT
                id,
                client_email,
                project_id,
                display_name,
                is_active,
                last_used,
                created_at,
                updated_at,
                (SELECT COUNT(*) FROM tokens WHERE service_account_id = service_accounts.id) as token_count
            FROM service_accounts
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), offset]);

        // 获取总数
        const [countResult] = await databaseService.query(`
            SELECT COUNT(*) as total FROM service_accounts ${whereClause}
        `, params);

        const response = {
            success: true,
            data: {
                accounts,
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
        logger.error('Get service accounts failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_SERVICE_ACCOUNTS_ERROR',
                message: 'Failed to get service accounts list'
            }
        });
    }
});

/**
 * 清理过期令牌
 */
router.post('/tokens/cleanup', async (req, res) => {
    try {
        const result = await databaseService.query(`
            DELETE FROM token_mappings
            WHERE status = 'expired' OR expires_at < NOW()
        `);

        const response = {
            success: true,
            data: {
                deletedTokens: result[0].affectedRows,
                message: `Successfully cleaned up ${result[0].affectedRows} expired tokens`,
                timestamp: new Date().toISOString()
            }
        };

        res.json(response);
    } catch (error) {
        logger.error('Token cleanup failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'TOKEN_CLEANUP_ERROR',
                message: 'Failed to cleanup expired tokens'
            }
        });
    }
});

/**
 * 获取API使用统计
 */
router.get('/api/stats', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // 这里应该从日志表或统计表中获取数据
        // 暂时返回模拟数据
        const mockStats = {
            totalRequests: Math.floor(Math.random() * 10000) + 1000,
            successfulRequests: Math.floor(Math.random() * 9000) + 900,
            failedRequests: Math.floor(Math.random() * 1000) + 100,
            averageResponseTime: Math.floor(Math.random() * 500) + 50,
            requestsPerDay: Array.from({ length: parseInt(days) }, (_, i) => ({
                date: new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                requests: Math.floor(Math.random() * 1500) + 100
            }))
        };

        const response = {
            success: true,
            data: {
                ...mockStats,
                period: `${days} days`,
                timestamp: new Date().toISOString()
            }
        };

        res.json(response);
    } catch (error) {
        logger.error('API stats check failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'API_STATS_ERROR',
                message: 'Failed to get API statistics'
            }
        });
    }
});

/**
 * 健康检查端点
 */
router.get('/health', async (req, res) => {
    try {
        const startTime = Date.now();

        // 检查所有服务
        const dbHealthy = await databaseService.healthCheck();
        const cacheStats = cacheService.getStats();

        const isHealthy = dbHealthy.connected && cacheStats.redisConnected;

        const response = {
            success: true,
            data: {
                status: isHealthy ? 'healthy' : 'unhealthy',
                checks: {
                    database: dbHealthy.connected ? 'pass' : 'fail',
                    cache: cacheStats.redisConnected ? 'pass' : 'fail'
                },
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }
        };

        res.status(isHealthy ? 200 : 503).json(response);
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
            success: false,
            error: {
                code: 'HEALTH_CHECK_ERROR',
                message: 'Health check failed'
            }
        });
    }
});

module.exports = router;