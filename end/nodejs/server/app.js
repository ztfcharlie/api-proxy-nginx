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
const ServiceAccountManager = require('./services/ServiceAccountManager'); 
const SyncManager = require('./services/SyncManager');
const { CacheService } = require('./services/CacheService');
const WebSocketService = require('./services/WebSocketService'); // [Added]

const { errorHandler } = require('./middleware/errorHandler');
const { loggingMiddleware } = require('./middleware/logging');

// 导入路由
const indexRoutes = require('./routes/index');
const oauth2MockRoutes = require('./routes/oauth2_mock');
const adminRoutes = require('./routes/admin/index'); // New Admin Structure
const healthRoutes = require('./routes/health');
const privacyRoutes = require('./routes/privacy'); // [Added] Privacy Check

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
        
        // [Added] Serve static files for Landing Page (root)
        this.app.use(express.static(path.join(__dirname, '../web/public')));
        // [Keep] Serve static files for Admin Console
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
        this.app.use('/api/auth', require('./routes/auth')); // [Added] Auth Routes
        
        // 路由
        this.app.use('/api/config', require('./routes/config'));
        this.app.use('/api/health', require('./routes/health'));
        this.app.use('/api/privacy', privacyRoutes); // [Added] Privacy Check Route
        this.app.use('/api/public', require('./routes/public_api')); // [Added] Public API for Landing Page
        this.app.use('/api/internal', require('./routes/internal')); // [Added] Internal APIs (Nginx Fallback)
        this.app.use('/api/oauth2', require('./routes/oauth2')); // 内部调用
        this.app.use('/api/oauth2_mock', require('./routes/oauth2_mock')); // 管理端模拟配置
        this.app.use('/api/client-test', require('./routes/clientTest')); // [Added] Client Test Tools
        
        // [Added] Mock API 服务
        this.app.use('/mock', require('./routes/mock'));
        this.app.use('/v1', require('./routes/mock')); // [Added] Handle /v1/... requests from Nginx
        
        // OAuth2 端点 (模拟 Google)
        // this.app.use('/', require('./routes/index')); // 已在上方包含，注释掉避免冲突
        this.app.use('/accounts.google.com', require('./routes/index')); // 兼容旧路径


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

        // New Admin APIs
        this.app.use(`${apiPrefix}${adminPath}`, adminRoutes);
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

            // --- ServiceAccountManager ---
            ServiceAccountManager.initialize(this.services.redis);
            LoggerService.info('[DEBUG] Calling startTokenRefreshJob...');
            ServiceAccountManager.startTokenRefreshJob();
            LoggerService.info('ServiceAccountManager initialized');

            // --- SyncManager ---
            SyncManager.initialize(this.services.redis);
            // 异步执行同步
            SyncManager.performFullSync(); 
            // 启动一致性看门狗
            SyncManager.startReconciliationJob();

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
                
                // [Added] Start WebSocket Service
                WebSocketService.initialize(this.server);
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
