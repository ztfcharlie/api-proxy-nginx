const LoggerService = require('../services/LoggerService');

const logger = LoggerService;

/**
 * 错误处理中间件
 * 统一处理应用中的错误，返回格式化的错误响应
 */

// 错误类型定义
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

// 预定义错误类型
class ValidationError extends AppError {
    constructor(message, details = null) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404, 'NOT_FOUND_ERROR');
    }
}

class ConflictError extends AppError {
    constructor(message = 'Resource conflict') {
        super(message, 409, 'CONFLICT_ERROR');
    }
}

class RateLimitError extends AppError {
    constructor(message = 'Rate limit exceeded') {
        super(message, 429, 'RATE_LIMIT_ERROR');
    }
}

class DatabaseError extends AppError {
    constructor(message = 'Database operation failed', details = null) {
        super(message, 500, 'DATABASE_ERROR', details);
    }
}

class ExternalServiceError extends AppError {
    constructor(message = 'External service error', service = null) {
        super(message, 502, 'EXTERNAL_SERVICE_ERROR', { service });
    }
}

/**
 * 错误处理中间件
 */
const errorHandler = (error, req, res, next) => {
    const requestId = req.requestId || 'unknown';
    const startTime = req.startTime || Date.now();
    const duration = Date.now() - startTime;

    // 默认错误对象
    let err = error;

    // 如果不是AppError实例，包装成AppError
    if (!(error instanceof AppError)) {
        if (error.name === 'ValidationError') {
            err = new ValidationError(error.message, error.details);
        } else if (error.name === 'JsonWebTokenError') {
            err = new AuthenticationError('Invalid token');
        } else if (error.name === 'TokenExpiredError') {
            err = new AuthenticationError('Token expired');
        } else if (error.name === 'CastError') {
            err = new ValidationError('Invalid data format');
        } else if (error.code === 'LIMIT_FILE_SIZE') {
            err = new ValidationError('File too large');
        } else if (error.code === 'ECONNREFUSED') {
            err = new ExternalServiceError('Service unavailable', 'database');
        } else {
            // 未知错误
            err = new AppError(
                process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
                500,
                'INTERNAL_ERROR',
                process.env.NODE_ENV === 'production' ? null : { stack: error.stack }
            );
        }
    }

    // 构建错误响应
    const errorResponse = {
        success: false,
        error: {
            code: err.code,
            message: err.message,
            requestId,
            timestamp: new Date().toISOString(),
            ...(err.details && { details: err.details })
        }
    };

    // 开发环境添加堆栈信息
    if (process.env.NODE_ENV !== 'production' && error.stack) {
        errorResponse.error.stack = error.stack;
    }

    // 记录错误日志
    const logLevel = err.statusCode >= 500 ? 'error' : 'warn';

    logger[logLevel]('Request error:', {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        statusCode: err.statusCode,
        errorCode: err.code,
        errorMessage: err.message,
        duration: `${duration}ms`,
        ...(err.details && { errorDetails: err.details }),
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    });

    // 设置响应头
    res.status(err.statusCode);
    res.set('X-Request-ID', requestId);
    res.set('X-Response-Time', `${duration}ms`);

    // 根据请求格式返回响应
    const acceptHeader = req.get('Accept') || '';
    const wantsJson = acceptHeader.includes('application/json') ||
                     req.headers['content-type']?.includes('application/json');

    if (wantsJson || req.method !== 'GET') {
        // JSON响应
        res.json(errorResponse);
    } else {
        // HTML响应（浏览器友好）
        const htmlError = generateErrorHtml(errorResponse);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(htmlError);
    }
};

/**
 * 404处理中间件
 */
const notFoundHandler = (req, res, next) => {
    const requestId = req.requestId || 'unknown';

    const error = new NotFoundError(`Route ${req.method} ${req.url} not found`);

    logger.warn('Route not found:', {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });

    const errorResponse = {
        success: false,
        error: {
            code: error.code,
            message: error.message,
            requestId,
            timestamp: new Date().toISOString()
        }
    };

    res.status(404);
    res.set('X-Request-ID', requestId);

    // 根据请求格式返回响应
    const acceptHeader = req.get('Accept') || '';
    const wantsJson = acceptHeader.includes('application/json');

    if (wantsJson || req.method !== 'GET') {
        res.json(errorResponse);
    } else {
        const htmlError = generateErrorHtml(errorResponse, 404);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(htmlError);
    }
};

/**
 * 异步错误包装器
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * 生成HTML错误页面
 */
function generateErrorHtml(errorResponse, statusCode = 500) {
    const { code, message, requestId, timestamp } = errorResponse.error;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>错误 ${statusCode}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
        }
        .container {
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e9ecef;
        }
        .status-code {
            font-size: 3em;
            color: #dc3545;
            font-weight: bold;
        }
        .error-title {
            font-size: 1.5em;
            margin-top: 10px;
            color: #495057;
        }
        .error-details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 6px;
            margin: 20px 0;
        }
        .error-code {
            font-family: 'Courier New', monospace;
            background: #e9ecef;
            padding: 2px 6px;
            border-radius: 3px;
            color: #495057;
        }
        .request-info {
            margin-top: 30px;
            padding: 15px;
            background: #e3f2fd;
            border-radius: 6px;
            border-left: 4px solid #2196f3;
        }
        .help-text {
            text-align: center;
            margin-top: 30px;
            color: #6c757d;
        }
        .help-text a {
            color: #007bff;
            text-decoration: none;
        }
        .help-text a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="status-code">${statusCode}</div>
            <div class="error-title">请求处理出错</div>
        </div>

        <div class="error-details">
            <h3>错误信息</h3>
            <p><strong>错误代码:</strong> <span class="error-code">${code}</span></p>
            <p><strong>错误描述:</strong> ${message}</p>
        </div>

        <div class="request-info">
            <h4>请求信息</h4>
            <p><strong>请求ID:</strong> ${requestId}</p>
            <p><strong>时间戳:</strong> ${timestamp}</p>
        </div>

        <div class="help-text">
            <p>如果这是一个持续存在的问题，请联系技术支持。</p>
            <p><a href="/">返回首页</a></p>
        </div>
    </div>
</body>
</html>`;
}

/**
 * 同步错误处理（用于未捕获的Promise拒绝等）
 */
const setupUncaughtExceptionHandler = () => {
    // 捕获未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Promise Rejection:', {
            reason: reason instanceof Error ? reason.message : reason,
            stack: reason instanceof Error ? reason.stack : null,
            promise: promise.toString()
        });

        // 在生产环境中优雅退出
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    });

    // 捕获未捕获的异常
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', {
            error: error.message,
            stack: error.stack
        });

        // 优雅退出
        process.exit(1);
    });
};

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler,
    setupUncaughtExceptionHandler,
    // 错误类型
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    DatabaseError,
    ExternalServiceError
};