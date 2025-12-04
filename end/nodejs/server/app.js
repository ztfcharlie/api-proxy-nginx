const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// 导入服务和中间件
const DatabaseService = require('./services/DatabaseService');
const RedisService = require('./services/RedisService');
const LoggerService = require('./services/LoggerService');
const OAuth2Service = require('./services/OAuth2Service');
const TokenService = require('./services/TokenService');
const TokenMappingService = require('./services/TokenMappingService');
const { CacheService } = require('./services/CacheService');

const { errorHandler } = require('./middleware/errorHandler');
const { authMiddleware } = require('./middleware/auth');
const { loggingMiddleware } = require('./middleware/logging');

// 导入路由
const indexRoutes = require('./routes/index');
const oauth2Routes = require('./routes/oauth2');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/clients');
const serverAccountRoutes = require('./routes/serverAccounts');
const healthRoutes = require('./routes/health');

class OAuth2MockServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 8889;
        this.nodeEnv = process.env.NODE_ENV || 'production';
        this.services = {};
        this.setupMiddlewares();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    setupMiddlewares() {
        // 安全中间件 - 始终启用
        this.app.use(helmet({
            contentSecurityPolicy: false,
            crossOriginOpenerPolicy: false,
            crossOriginResourcePolicy: false
        }));

        // CORS 配置
        this.app.use(cors({
            origin: process.env.CORS_ORIGIN || '*',
            methods: (process.env.CORS_METHODS || 'GET,POST,PUT,DELETE,OPTIONS').split(','),
            allowedHeaders: (process.env.CORS_HEADERS || 'Content-Type,Authorization,X-Requested-With').split(',')
        }));

        // 压缩中间件
        if (process.env.ENABLE_COMPRESSION !== 'false') {
            this.app.use(compression());
        }

        // 解析 JSON 和 URL 编码数据
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // 静态文件服务 - 提供 Web 管理界面
        this.app.use('/admin', express.static(path.join(__dirname, '../web/public')));

        // 日志中间件
        if (process.env.ENABLE_MORGAN !== 'false') {
            this.app.use(morgan('combined', {
                stream: {
                    write: (message) => LoggerService.info(message.trim())
                }
            }));
        }

        this.app.use(loggingMiddleware);
    }

    setupRoutes() {
        const apiPrefix = process.env.API_PREFIX || '/api';
        const adminPath = process.env.ADMIN_PATH || '/admin';

        // 根路径首页 - 添加在最前面
        this.app.use('/', indexRoutes);

        // 健康检查
        this.app.use('/health', healthRoutes);

        // Swagger API 文档
        if (process.env.ENABLE_SWAGGER === 'true') {
            const swaggerUi = require('swagger-ui-express');
            const swaggerSpec = require('./swagger');
            this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
            LoggerService.info('Swagger API documentation available at /api-docs');
        }

        // OAuth2 模拟端点（模拟 Google OAuth2 API）- 注入服务实例
        this.app.use('/accounts.google.com', (req, res, next) => {
            req.services = this.services;
            oauth2Routes(req, res, next);
        });

        // 管理 API 端点
        this.app.use(`${apiPrefix}/clients`, clientRoutes);
        this.app.use(`${apiPrefix}/server-accounts`, serverAccountRoutes);
        this.app.use(`${adminPath}`, adminRoutes);
    }

    setupErrorHandling() {
        // 404 处理
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: `Cannot ${req.method} ${req.originalUrl}`,
                timestamp: new Date().toISOString()
            });
        });

        // 全局错误处理
        this.app.use(errorHandler);
    }

    async initializeServices() {
        try {
            LoggerService.info('Initializing OAuth2 Mock Services...');

            // 初始化数据库服务
            this.services.database = new DatabaseService();
            await this.services.database.initialize();
            LoggerService.info('Database service initialized');

            // 初始化 Redis 服务
            this.services.redis = new RedisService();
            await this.services.redis.initialize();
            LoggerService.info('Redis service initialized');

            // 初始化缓存服务
            this.services.cache = new CacheService();
            await this.services.cache.initialize();
            LoggerService.info('Cache service initialized');

            // 初始化令牌服务
            this.services.token = new TokenService(
                this.services.database,
                this.services.cache
            );
            LoggerService.info('Token service initialized');

            // 初始化 TokenMapping 服务
            this.services.tokenMapping = new TokenMappingService(
                this.services.redis
            );
            LoggerService.info('TokenMapping service initialized');

            // 初始化 OAuth2 服务（注入 TokenMappingService）
            this.services.oauth2 = new OAuth2Service(
                this.services.database,
                this.services.token,
                this.services.cache,
                this.services.redis,
                this.services.tokenMapping
            );
            LoggerService.info('OAuth2 service initialized with TokenMapping integration');

            LoggerService.info('All services initialized successfully');
        } catch (error) {
            LoggerService.error('Failed to initialize services:', error);
            throw error;
        }
    }

    async start() {
        try {
            await this.initializeServices();

            this.server = this.app.listen(this.port, () => {
                LoggerService.info(`OAuth2 Mock Server started on port ${this.port}`, {
                    port: this.port,
                    environment: this.nodeEnv,
                    pid: process.pid,
                    nodeVersion: process.version,
                    timestamp: new Date().toISOString()
                });
            });

            // 优雅关闭处理
            this.setupGracefulShutdown();

        } catch (error) {
            LoggerService.error('Failed to start OAuth2 Mock Server:', error);
            process.exit(1);
        }
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            LoggerService.info(`Received ${signal}, shutting down gracefully...`);

            if (this.server) {
                this.server.close(() => {
                    LoggerService.info('HTTP server closed');
                });
            }

            // 关闭服务连接
            try {
                if (this.services.database) {
                    await this.services.database.close();
                }
                if (this.services.redis) {
                    await this.services.redis.close();
                }
            } catch (error) {
                LoggerService.error('Error during shutdown:', error);
            }

            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

    async stop() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(resolve);
            });
        }
    }
}

// 启动服务器
const server = new OAuth2MockServer();
server.start().catch((error) => {
    LoggerService.error('Failed to start server:', error);
    process.exit(1);
});

module.exports = OAuth2MockServer;