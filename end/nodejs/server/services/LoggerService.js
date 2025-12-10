const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const Paths = require('../config/Paths');

// Deferred require to avoid circular dependency if SyncManager uses logger
let SyncManager; 

class LoggerService {
    constructor() {
        this.logger = null;
        this.initialize();
    }
    
    // ... (keep existing initialize code) ...

    // Redis Pub/Sub Helper
    publishLog(level, message, meta = {}) {
        // [Performance] Skip if debug stream is disabled
        if (process.env.ENABLE_DEBUG_STREAM !== 'true') return;

        try {
            if (!SyncManager) {
                try {
                    SyncManager = require('./SyncManager');
                } catch (e) { return; }
            }
            if (SyncManager && SyncManager.redis && SyncManager.redis.redis) {
                const logEntry = JSON.stringify({
                    ts: new Date().toISOString(),
                    source: 'node-admin',
                    level: level,
                    msg: message,
                    meta: meta
                });
                // Fire and forget
                SyncManager.redis.redis.publish('sys:log_stream', logEntry).catch(() => {});
            }
        } catch (e) {
            // Squelch logging errors to prevent infinite loops
        }
    }

    // 基础日志方法
    debug(message, meta = {}) {
        this.logger.debug(message, meta);
        this.publishLog('debug', message, meta);
    }

    info(message, meta = {}) {
        this.logger.info(message, meta);
        this.publishLog('info', message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
        this.publishLog('warn', message, meta);
    }

    error(message, meta = {}) {
        this.logger.error(message, meta);
        this.publishLog('error', message, meta);
    }
// ... (rest of the class) ...

    // HTTP 请求日志
    http(message, meta = {}) {
        this.logger.log('http', message, meta);
    }

    // OAuth2 专用日志
    oauth2(message, meta = {}) {
        this.logger.log('oauth2', message, meta);
    }

    // 安全相关日志
    security(message, meta = {}) {
        this.logger.warn(`[SECURITY] ${message}`, {
            ...meta,
            category: 'security',
            timestamp: new Date().toISOString()
        });
    }

    // 性能日志
    performance(operation, duration, meta = {}) {
        this.logger.info(`[PERFORMANCE] ${operation} completed in ${duration}ms`, {
            ...meta,
            operation,
            duration,
            category: 'performance',
            timestamp: new Date().toISOString()
        });
    }

    // 数据库操作日志
    database(operation, table, duration, meta = {}) {
        this.logger.debug(`[DATABASE] ${operation} on ${table} in ${duration}ms`, {
            ...meta,
            operation,
            table,
            duration,
            category: 'database'
        });
    }

    // 缓存操作日志
    cache(operation, key, hit, duration, meta = {}) {
        this.logger.debug(`[CACHE] ${operation} ${key} - ${hit ? 'HIT' : 'MISS'} in ${duration}ms`, {
            ...meta,
            operation,
            key,
            hit,
            duration,
            category: 'cache'
        });
    }

    // OAuth2 认证日志
    oauth2Auth(requestType, clientToken, success, duration, meta = {}) {
        const level = success ? 'oauth2' : 'warn';
        this.logger.log(level, `[OAUTH2] ${requestType} ${clientToken} - ${success ? 'SUCCESS' : 'FAILED'} in ${duration}ms`, {
            ...meta,
            requestType,
            clientToken: this.maskSensitive(clientToken),
            success,
            duration,
            category: 'oauth2_auth'
        });
    }

    // API 调用日志
    apiCall(method, url, statusCode, duration, meta = {}) {
        const level = statusCode >= 400 ? 'warn' : 'http';
        this.logger.log(level, `[API] ${method} ${url} - ${statusCode} in ${duration}ms`, {
            ...meta,
            method,
            url,
            statusCode,
            duration,
            category: 'api_call'
        });
    }

    // 令牌操作日志
    tokenOperation(operation, tokenType, clientToken, meta = {}) {
        this.logger.oauth2(`[TOKEN] ${operation} ${tokenType} for client ${this.maskSensitive(clientToken)}`, {
            ...meta,
            operation,
            tokenType,
            clientToken: this.maskSensitive(clientToken),
            category: 'token_operation'
        });
    }

    // 敏感信息掩码
    maskSensitive(data) {
        if (!data || typeof data !== 'string') {
            return data;
        }

        // 如果是令牌或密钥，只显示前几位和后几位
        if (data.length > 10) {
            return `${data.substring(0, 4)}****${data.substring(data.length - 4)}`;
        }

        // 短字符串完全掩码
        return '****';
    }

    // 创建子日志器
    child(meta) {
        return {
            debug: (message, extraMeta = {}) => this.debug(message, { ...meta, ...extraMeta }),
            info: (message, extraMeta = {}) => this.info(message, { ...meta, ...extraMeta }),
            warn: (message, extraMeta = {}) => this.warn(message, { ...meta, ...extraMeta }),
            error: (message, extraMeta = {}) => this.error(message, { ...meta, ...extraMeta }),
            http: (message, extraMeta = {}) => this.http(message, { ...meta, ...extraMeta }),
            oauth2: (message, extraMeta = {}) => this.oauth2(message, { ...meta, ...extraMeta }),
            security: (message, extraMeta = {}) => this.security(message, { ...meta, ...extraMeta }),
            performance: (operation, duration, extraMeta = {}) =>
                this.performance(operation, duration, { ...meta, ...extraMeta }),
            database: (operation, table, duration, extraMeta = {}) =>
                this.database(operation, table, duration, { ...meta, ...extraMeta }),
            cache: (operation, key, hit, duration, extraMeta = {}) =>
                this.cache(operation, key, hit, duration, { ...meta, ...extraMeta })
        };
    }

    // 获取日志统计
    getStats() {
        return {
            logDir: process.env.LOG_DIR || '../logs/oauth2',
            level: this.logger.level,
            transports: this.logger.transports.map(t => ({
                name: t.name,
                level: t.level,
                filename: t.filename || 'console'
            }))
        };
    }

    // 设置日志级别
    setLevel(level) {
        this.logger.level = level;
        this.logger.transports.forEach(transport => {
            if (transport.level) {
                transport.level = level;
            }
        });
        this.info(`Log level changed to: ${level}`);
    }

    // 清理旧日志文件
    async cleanup(days = 30) {
        try {
            const logDir = process.env.LOG_DIR || '../logs/oauth2';
            const files = fs.readdirSync(logDir);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            let deletedCount = 0;

            for (const file of files) {
                const filePath = path.join(logDir, file);
                const stats = fs.statSync(filePath);

                if (stats.isFile() && stats.mtime < cutoffDate) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                    this.info(`Deleted old log file: ${file}`);
                }
            }

            this.info(`Log cleanup completed. Deleted ${deletedCount} files older than ${days} days`);
            return deletedCount;
        } catch (error) {
            this.error('Failed to cleanup old log files:', error);
            throw error;
        }
    }
}

// 导出单例实例
const loggerInstance = new LoggerService();

module.exports = loggerInstance;