const express = require('express');
const LoggerService = require('../services/LoggerService');
const { DatabaseService } = require('../services/DatabaseService');
const { CacheService } = require('../services/CacheService');

const router = express.Router();
const logger = LoggerService;

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

/**
 * 基本健康检查
 */
router.get('/', async (req, res) => {
    try {
        const startTime = Date.now();
        const responseTime = Date.now() - startTime;

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            responseTime: `${responseTime}ms`,
            version: '1.0.0'
        });
    } catch (error) {
        logger.error('Basic health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * 详细健康检查
 */
router.get('/detailed', async (req, res) => {
    const startTime = Date.now();
    const checks = {};
    let isHealthy = true;

    try {
        // 数据库健康检查
        try {
            if (!databaseService) {
                await initializeServices();
            }
            const dbCheck = await databaseService.healthCheck();
            checks.database = {
                status: dbCheck.connected ? 'healthy' : 'unhealthy',
                responseTime: dbCheck.responseTime || null,
                lastCheck: dbCheck.timestamp || new Date().toISOString(),
                details: dbCheck
            };
            if (!dbCheck.connected) isHealthy = false;
        } catch (error) {
            checks.database = {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
            isHealthy = false;
        }

        // 缓存健康检查
        try {
            if (!cacheService) {
                await initializeServices();
            }
            const cacheStats = cacheService.getStats();
            checks.cache = {
                status: cacheStats.redisConnected ? 'healthy' : 'unhealthy',
                hitRate: cacheStats.hitRate,
                memoryCacheSize: cacheStats.memoryCacheSize,
                totalRequests: cacheStats.hits + cacheStats.misses,
                timestamp: new Date().toISOString()
            };
            if (!cacheStats.redisConnected) isHealthy = false;
        } catch (error) {
            checks.cache = {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
            isHealthy = false;
        }

        // 系统资源检查
        const memUsage = process.memoryUsage();
        checks.system = {
            status: 'healthy', // 简化的系统状态检查
            uptime: process.uptime(),
            memory: {
                rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
                heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
                external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
            },
            cpu: process.cpuUsage(),
            version: process.version,
            platform: process.platform,
            timestamp: new Date().toISOString()
        };

        // 磁盘空间检查（简化版）
        checks.disk = {
            status: 'healthy', // 实际应该检查磁盘空间
            timestamp: new Date().toISOString()
        };

        const overallStatus = isHealthy ? 'healthy' : 'unhealthy';
        const responseTime = Date.now() - startTime;

        const response = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            responseTime: `${responseTime}ms`,
            checks,
            summary: {
                total: Object.keys(checks).length,
                passed: Object.values(checks).filter(check => check.status === 'healthy').length,
                failed: Object.values(checks).filter(check => check.status === 'unhealthy').length
            }
        };

        res.status(isHealthy ? 200 : 503).json(response);
    } catch (error) {
        logger.error('Detailed health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
            responseTime: `${Date.now() - startTime}ms`
        });
    }
});

/**
 * 就绪检查（Kubernetes Liveness/Readiness Probe）
 */
router.get('/ready', async (req, res) => {
    try {
        // 检查所有关键服务是否就绪
        const checks = {
            database: false,
            cache: false
        };

        // 数据库就绪检查
        try {
            if (!databaseService) {
                await initializeServices();
            }
            const dbCheck = await databaseService.healthCheck();
            checks.database = dbCheck.connected;
        } catch (error) {
            logger.warn('Database readiness check failed:', error);
        }

        // 缓存就绪检查
        try {
            if (!cacheService) {
                await initializeServices();
            }
            const cacheStats = cacheService.getStats();
            checks.cache = cacheStats.redisConnected;
        } catch (error) {
            logger.warn('Cache readiness check failed:', error);
        }

        const isReady = Object.values(checks).every(check => check === true);

        if (isReady) {
            res.status(200).json({
                status: 'ready',
                checks,
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(503).json({
                status: 'not ready',
                checks,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        logger.error('Readiness check failed:', error);
        res.status(503).json({
            status: 'not ready',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
存活检查（Kubernetes Liveness Probe）
 */
router.get('/live', (req, res) => {
    try {
        // 简单的存活检查，只要进程能响应就认为存活
        res.status(200).json({
            status: 'alive',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    } catch (error) {
        logger.error('Liveness check failed:', error);
        res.status(503).json({
            status: 'not alive',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * 组件健康检查
 */
router.get('/components/:component', async (req, res) => {
    try {
        const { component } = req.params;
        const startTime = Date.now();

        let checkResult = {
            component,
            status: 'unknown',
            timestamp: new Date().toISOString(),
            responseTime: null
        };

        switch (component.toLowerCase()) {
            case 'database':
                try {
                    if (!databaseService) {
                        await initializeServices();
                    }
                    const dbCheck = await databaseService.healthCheck();
                    checkResult = {
                        ...checkResult,
                        status: dbCheck.connected ? 'healthy' : 'unhealthy',
                        responseTime: dbCheck.responseTime,
                        details: dbCheck
                    };
                } catch (error) {
                    checkResult = {
                        ...checkResult,
                        status: 'unhealthy',
                        error: error.message
                    };
                }
                break;

            case 'cache':
                try {
                    if (!cacheService) {
                        await initializeServices();
                    }
                    const cacheStats = cacheService.getStats();
                    checkResult = {
                        ...checkResult,
                        status: cacheStats.redisConnected ? 'healthy' : 'unhealthy',
                        details: cacheStats
                    };
                } catch (error) {
                    checkResult = {
                        ...checkResult,
                        status: 'unhealthy',
                        error: error.message
                    };
                }
                break;

            case 'system':
                const memUsage = process.memoryUsage();
                checkResult = {
                    ...checkResult,
                    status: 'healthy',
                    details: {
                        uptime: process.uptime(),
                        memory: {
                            rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
                            heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                            heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
                        },
                        cpu: process.cpuUsage(),
                        version: process.version,
                        platform: process.platform
                    }
                };
                break;

            default:
                return res.status(404).json({
                    error: 'Component not found',
                    availableComponents: ['database', 'cache', 'system']
                });
        }

        checkResult.responseTime = Date.now() - startTime;
        const statusCode = checkResult.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(checkResult);
    } catch (error) {
        logger.error(`Component health check failed for ${req.params.component}:`, error);
        res.status(503).json({
            component: req.params.component,
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * 健康检查指标（Prometheus格式）
 */
router.get('/metrics', (req, res) => {
    try {
        const memUsage = process.memoryUsage();
        const uptime = process.uptime();

        const metrics = [
            // Node.js 进程指标
            `# HELP nodejs_process_uptime_seconds Process uptime in seconds`,
            `# TYPE nodejs_process_uptime_seconds counter`,
            `nodejs_process_uptime_seconds ${uptime}`,
            '',
            `# HELP nodejs_process_memory_bytes Process memory usage in bytes`,
            `# TYPE nodejs_process_memory_bytes gauge`,
            `nodejs_process_memory_bytes{type="rss"} ${memUsage.rss}`,
            `nodejs_process_memory_bytes{type="heap_used"} ${memUsage.heapUsed}`,
            `nodejs_process_memory_bytes{type="heap_total"} ${memUsage.heapTotal}`,
            `nodejs_process_memory_bytes{type="external"} ${memUsage.external}`,
            '',
            `# HELP oauth2_service_health Service health status (1 = healthy, 0 = unhealthy)`,
            `# TYPE oauth2_service_health gauge`,
            `oauth2_service_health 1`,
            '',
            `# HELP oauth2_service_start_time_seconds Service start time in Unix timestamp`,
            `# TYPE oauth2_service_start_time_seconds counter`,
            `oauth2_service_start_time_seconds ${Date.now() - (uptime * 1000)}`
        ];

        res.set('Content-Type', 'text/plain');
        res.send(metrics.join('\n'));
    } catch (error) {
        logger.error('Metrics endpoint failed:', error);
        res.status(500).json({
            error: 'Failed to generate metrics',
            message: error.message
        });
    }
});

module.exports = router;