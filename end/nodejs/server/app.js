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
const ServiceAccountManager = require('./services/ServiceAccountManager'); 
const SyncManager = require('./services/SyncManager'); // New
const { CacheService } = require('./services/CacheService');

const { errorHandler } = require('./middleware/errorHandler');
const { loggingMiddleware } = require('./middleware/logging');

// 导入路由
const indexRoutes = require('./routes/index');
const oauth2Routes = require('./routes/oauth2');
const oauth2MockRoutes = require('./routes/oauth2_mock');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/clients');
const serverAccountRoutes = require('./routes/serverAccounts');
const mapConfigRoutes = require('./routes/mapConfig');
const serviceKeyRoutes = require('./routes/serviceKeys');
const jwtFileRoutes = require('./routes/jwtFiles');
const healthRoutes = require('./routes/health');

class OAuth2MockServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 8889;
        this.nodeEnv = process.env.NODE_ENV || 'production';
        this.services = {};
        this.mockRouter = null;

        this.setupMiddlewares();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    setupMiddlewares() {
        this.app.use(helmet({
            contentSecurityPolicy: false,
            crossOriginOpenerPolicy: false,
            crossOriginResourcePolicy: false
        }));

        this.app.use(cors({
            origin: process.env.CORS_ORIGIN || '*',
            methods: (process.env.CORS_METHODS || 'GET,POST,PUT,DELETE,OPTIONS').split(','),
            allowedHeaders: (process.env.CORS_HEADERS || 'Content-Type,Authorization,X-Requested-With').split(',')
        }));

        if (process.env.ENABLE_COMPRESSION !== 'false') {
            this.app.use(compression());
        }

        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        this.app.use('/admin', express.static(path.join(__dirname, '../web/public')));

        if (process.env.ENABLE_MORGAN !== 'false') {
            this.app.use(morgan('combined', {
                stream: { write: (message) => LoggerService.info(message.trim()) }
            }));
        }

        this.app.use(loggingMiddleware);
    }

    setupRoutes() {
        const apiPrefix = process.env.API_PREFIX || '/api';
        const adminPath = process.env.ADMIN_PATH || '/admin';

        this.app.use('/', indexRoutes);
        this.app.use('/health', healthRoutes);

        if (process.env.ENABLE_SWAGGER === 'true') {
            const swaggerUi = require('swagger-ui-express');
            const swaggerSpec = require('./swagger');
            this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
        }

        this.app.use('/accounts.google.com/oauth2', (req, res, next) => {
            if (this.mockRouter) {
                return this.mockRouter(req, res, next);
            } else {
                return res.status(503).json({ 
                    error: 'service_unavailable', 
                    message: 'OAuth2 Mock Service is initializing' 
                });
            }
        });

        this.app.use('/accounts.google.com', (req, res, next) => {
            req.services = this.services;
            oauth2Routes(req, res, next);
        });

        this.app.use(`${apiPrefix}/clients`, clientRoutes);
        this.app.use(`${apiPrefix}/server-accounts`, serverAccountRoutes);
        this.app.use(`${apiPrefix}/map-config`, mapConfigRoutes);
        this.app.use(`${apiPrefix}/service-keys`, serviceKeyRoutes);
        this.app.use(`${apiPrefix}/jwt-files`, jwtFileRoutes);
        this.app.use(`${adminPath}`, adminRoutes);
    }

    setupErrorHandling() {
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: `Cannot ${req.method} ${req.originalUrl}`,
                timestamp: new Date().toISOString()
            });
        });
        this.app.use(errorHandler);
    }

    async initializeServices() {
        try {
            LoggerService.info('Initializing Services...');

            this.services.database = new DatabaseService();
            await this.services.database.initialize();

            this.services.redis = new RedisService();
            await this.services.redis.initialize();

            this.services.cache = new CacheService();
            await this.services.cache.initialize();

            this.services.token = new TokenService(
                this.services.database, 
                this.services.cache
            );

            this.services.tokenMapping = new TokenMappingService(
                this.services.redis
            );

            this.services.oauth2 = new OAuth2Service(
                this.services.database,
                this.services.token,
                this.services.cache,
                this.services.redis,
                this.services.tokenMapping
            );

            // --- ServiceAccountManager ---
            ServiceAccountManager.initialize(this.services.redis);
            ServiceAccountManager.startTokenRefreshJob();
            LoggerService.info('ServiceAccountManager initialized');

            // --- NEW: SyncManager ---
            SyncManager.initialize(this.services.redis);
            // 异步执行同步，不阻塞启动，但可能导致启动初期缓存未命中
            // 如果数据量小，建议 await
            await SyncManager.performFullSync();
            LoggerService.info('SyncManager: Full data synchronization completed');

            // Mock Router
            this.mockRouter = oauth2MockRoutes(this.services.redis, ServiceAccountManager);
            
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
                    env: this.nodeEnv
                });
            });
            
            this.setupGracefulShutdown();
        } catch (error) {
            LoggerService.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            LoggerService.info(`Received ${signal}, shutting down...`);
            if (this.server) this.server.close();
            
            try {
                if (this.services.database) await this.services.database.close();
                if (this.services.redis) await this.services.redis.close();
            } catch (e) {
                LoggerService.error('Error during shutdown:', e);
            }
            process.exit(0);
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

    async stop() {
        if (this.server) {
            return new Promise(resolve => this.server.close(resolve));
        }
    }
}

const server = new OAuth2MockServer();
server.start().catch(err => {
    LoggerService.error('Startup failed:', err);
    process.exit(1);
});

module.exports = OAuth2MockServer;