const LoggerService = require('../services/LoggerService');
const authMiddleware = require('./auth');

const logger = LoggerService;

const loggingMiddleware = async (req, res, next) => {
    const startTime = Date.now();
    const requestId = generateRequestId();

    // 请求ID
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    // 记录请求开始
    logRequest(req, requestId);

    // 拦截响应结束
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logResponse(req, res, duration, requestId);
    });

    // 拦截错误响应
    res.on('error', (error) => {
        const duration = Date.now() - startTime;
        logError(req, res, error, duration, requestId);
    });

    // 拦截连接关闭
    req.on('close', () => {
        const duration = Date.now() - startTime;
        logger.http(`Request closed by client`, {
            requestId,
            method: req.method,
            url: req.originalUrl,
            duration: `${duration}ms`,
            userAgent: req.headers['user-agent'],
            ip: getClientIP(req)
        });
    });

    next();
};

/**
 * 记录请求信息
 */
function logRequest(req, requestId) {
    const logData = {
        requestId,
        method: req.method,
        url: req.originalUrl,
        protocol: req.protocol,
        httpVersion: req.httpVersion,
        userAgent: req.headers['user-agent'],
        ip: getClientIP(req),
        headers: sanitizeHeaders(req.headers),
        query: req.query,
        body: sanitizeBody(req.body),
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length'],
        referer: req.headers.referer,
        timestamp: new Date().toISOString()
    };

    // OAuth2 特殊处理
    if (req.originalUrl && req.originalUrl.includes('/oauth2/')) {
        logRequestOAuth2(req, requestId, logData);
    }
    // API 调用特殊处理
    else if (req.originalUrl && req.originalUrl.startsWith('/api/')) {
        logger.http(`[API] Request started`, logData);
    }
    // 管理界面特殊处理
    else if (req.originalUrl && req.originalUrl.startsWith('/admin/')) {
        logger.http(`[ADMIN] Request started`, logData);
    }
    // 健康检查特殊处理
    else if (req.originalUrl && (req.originalUrl === '/health' || req.originalUrl === '/')) {
        logger.debug(`[HEALTH] Request started`, logData);
    }
    // 普通请求
    else {
        logger.http(`[REQUEST] Started`, logData);
    }
}

/**
 * 记录响应信息
 */
function logResponse(req, res, duration, requestId) {
    const logData = {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        duration: `${duration}ms`,
        userAgent: req.headers['user-agent'],
        ip: getClientIP(req),
        contentLength: res.getHeader('content-length'),
        contentType: res.getHeader('content-type'),
        headers: sanitizeHeaders(res.getHeaders()),
        timestamp: new Date().toISOString()
    };

    // 根据状态码分类记录
    if (res.statusCode >= 500) {
        logger.error(`[ERROR] Server error`, logData);
    } else if (res.statusCode >= 400) {
        logger.warn(`[CLIENT] Client error`, logData);
    } else if (res.statusCode >= 300) {
        logger.info(`[REDIRECT] Redirect response`, logData);
    } else {
        logger.info(`[SUCCESS] Request completed`, logData);
    }

    // OAuth2 特殊处理
    if (req.originalUrl && req.originalUrl.includes('/oauth2/')) {
        logResponseOAuth2(req, res, duration, requestId, logData);
    }
    // API 调用特殊处理
    else if (req.originalUrl && req.originalUrl.startsWith('/api/')) {
        logger.performance(`api_${req.method}_${req.originalUrl}`, duration, {
            requestId,
            statusCode: res.statusCode,
            path: req.originalUrl,
            method: req.method
        });
    }
}

/**
 * 记录错误信息
 */
function logError(req, res, error, duration, requestId) {
    const errorData = {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        },
        userAgent: req.headers['user-agent'],
        ip: getClientIP(req),
        headers: sanitizeHeaders(req.headers),
        body: sanitizeBody(req.body),
        timestamp: new Date().toISOString()
    };

    logger.error(`[ERROR] Request failed`, errorData);

    // 如果是 OAuth2 错误，记录到专门的日志
    if (req.originalUrl && req.originalUrl.includes('/oauth2/')) {
        logger.oauth2(`[OAUTH2] Error occurred`, errorData);
    }
}

/**
 * OAuth2 请求特殊处理
 */
function logRequestOAuth2(req, requestId, logData) {
    const oauth2Data = {
        ...logData,
        oauth2Type: identifyOAuth2Flow(req),
        clientId: extractClientId(req),
        scopes: extractScopes(req),
        grantType: extractGrantType(req),
        responseType: extractResponseType(req)
    };

    // 提取认证信息（不记录敏感数据）
    if (req.headers.authorization) {
        const authParts = req.headers.authorization.split(' ');
        if (authParts[0] === 'Bearer' && authParts[1]) {
            oauth2Data.tokenType = 'Bearer';
            oauth2Data.tokenLength = authParts[1].length;
        } else if (authParts[0] === 'Basic' && authParts[1]) {
            const basicParts = Buffer.from(authParts[1], 'base64').toString().split(':');
            if (basicParts.length >= 1) {
                oauth2Data.basicClientId = basicParts[0];
            }
        }
    }

    logger.oauth2(`[OAUTH2] ${oauth2Data.oauth2Type} request started`, oauth2Data);
}

/**
 * OAuth2 响应特殊处理
 */
function logResponseOAuth2(req, res, duration, requestId, logData) {
    const oauth2Data = {
        ...logData,
        oauth2Type: identifyOAuth2Flow(req),
        responseType: extractResponseType(req),
        tokensIssued: res.statusCode === 200,
        tokenReturned: res.statusCode === 200 ? hasTokenResponse(res) : false
    };

    // 记录 OAuth2 性能
    logger.performance(`oauth2_${oauth2Data.oauth2Type}`, duration, {
        requestId,
        clientId: extractClientId(req),
        grantType: extractGrantType(req),
        success: res.statusCode === 200,
        statusCode: res.statusCode
    });

    // 如果成功且有令牌，记录令牌操作
    if (res.statusCode === 200 && oauth2Data.tokenReturned) {
        const tokenData = extractTokenData(res);
        logger.tokenOperation('ISSUE', extractTokenType(req), extractClientId(req), {
            requestId,
            expiresIn: tokenData.expires_in,
            tokenType: tokenData.token_type,
            scopes: tokenData.scope
        });
    }

    logger.oauth2(`[OAUTH2] ${oauth2Data.oauth2Type} response completed`, oauth2Data);
}

/**
 * 识别 OAuth2 流程类型
 */
function identifyOAuth2Flow(req) {
    const path = req.path;
    const method = req.method;

    if (path.includes('/auth') && method === 'GET') {
        return 'authorization_code';
    }
    if (path.includes('/token') && method === 'POST') {
        const grantType = extractGrantType(req);
        switch (grantType) {
            case 'authorization_code':
                return 'token_exchange';
            case 'refresh_token':
                return 'token_refresh';
            case 'urn:ietf:params:oauth:grant-type:jwt-bearer':
                return 'service_account_jwt';
            case 'client_credentials':
                return 'client_credentials';
            default:
                return 'token_request';
        }
    }
    if (path.includes('/certs')) {
        return 'certificate_request';
    }
    if (path.includes('/metadata/x509')) {
        return 'service_account_certificate';
    }

    return 'oauth2_unknown';
}

/**
 * 提取客户端 ID
 */
function extractClientId(req) {
    // 从 Authorization 头提取
    if (req.headers.authorization) {
        const authParts = req.headers.authorization.split(' ');
        if (authParts[0] === 'Basic' && authParts[1]) {
            const basicParts = Buffer.from(authParts[1], 'base64').toString().split(':');
            if (basicParts.length >= 1) {
                return basicParts[0];
            }
        }
    }

    // 从请求体提取
    if (req.body && req.body.client_id) {
        return req.body.client_id;
    }

    // 从查询参数提取
    if (req.query && req.query.client_id) {
        return req.query.client_id;
    }

    return null;
}

/**
 * 提取作用域
 */
function extractScopes(req) {
    // 从请求体提取
    if (req.body && req.body.scope) {
        return req.body.scope;
    }

    // 从查询参数提取
    if (req.query && req.query.scope) {
        return req.query.scope;
    }

    return null;
}

/**
 * 提取授权类型
 */
function extractGrantType(req) {
    // 从请求体提取
    if (req.body && req.body.grant_type) {
        return req.body.grant_type;
    }

    // 从查询参数提取
    if (req.query && req.query.grant_type) {
        return req.query.grant_type;
    }

    return null;
}

/**
 * 提取响应类型
 */
function extractResponseType(req) {
    if (req.query && req.query.response_type) {
        return req.query.response_type;
    }

    return null;
}

/**
 * 提取令牌类型
 */
function extractTokenType(req) {
    const grantType = extractGrantType(req);
    switch (grantType) {
        case 'refresh_token':
            return 'refresh_token';
        case 'urn:ietf:params:oauth:grant-type:jwt-bearer':
        case 'authorization_code':
        case 'client_credentials':
        default:
            return 'access_token';
    }
}

/**
 * 检查是否有令牌响应
 */
function hasTokenResponse(res) {
    if (res.locals && res.locals.responseData) {
        const data = res.locals.responseData;
        return data.access_token || data.refresh_token;
    }
    return false;
}

/**
 * 提取令牌数据
 */
function extractTokenData(res) {
    if (res.locals && res.locals.responseData) {
        return res.locals.responseData;
    }

    // 尝试从响应头获取（如果适用）
    const contentType = res.getHeader('content-type');
    if (contentType && contentType.includes('application/json')) {
        // 这里需要从响应流读取，暂时返回空对象
        return {};
    }

    return {};
}

/**
 * 生成请求 ID
 */
function generateRequestId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `req_${timestamp}_${random}`;
}

/**
 * 获取客户端 IP
 */
function getClientIP(req) {
    return (
        req.headers['x-forwarded-for'] ||
        req.headers['x-real-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        (req.connection && req.connection.socket && req.connection.socket.remoteAddress) ||
        req.ip
    );
}

/**
 * 清理敏感请求头
 */
function sanitizeHeaders(headers) {
    const sanitized = { ...headers };

    // 移除敏感信息
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['set-cookie'];

    // 掩码其他可能敏感的头
    if (sanitized['x-api-key']) {
        sanitized['x-api-key'] = maskSensitiveValue(sanitized['x-api-key']);
    }
    if (sanitized['x-auth-token']) {
        sanitized['x-auth-token'] = maskSensitiveValue(sanitized['x-auth-token']);
    }

    return sanitized;
}

/**
 * 清理敏感请求体
 */
function sanitizeBody(body) {
    if (!body || typeof body !== 'object') {
        return body;
    }

    const sanitized = { ...body };

    // 移除或掩码敏感字段
    const sensitiveFields = [
        'password',
        'secret',
        'access_token',
        'refresh_token',
        'client_secret',
        'private_key',
        'authorization_code',
        'assertion'
    ];

    for (const field of sensitiveFields) {
        if (sanitized[field]) {
            sanitized[field] = maskSensitiveValue(sanitized[field]);
        }
    }

    return sanitized;
}

/**
 * 掩码敏感值
 */
function maskSensitiveValue(value) {
    if (!value || typeof value !== 'string') {
        return value;
    }

    if (value.length <= 8) {
        return '****';
    }

    return `${value.substring(0, 4)}****${value.substring(value.length - 4)}`;
}

/**
 * 数据库操作日志装饰器
 */
function logDatabaseOperation(operation, table, options = {}) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function(...args) {
            const startTime = Date.now();
            const operationId = generateRequestId();

            try {
                logger.database(`[DB] ${operation} started on ${table}`, {
                    operationId,
                    operation,
                    table,
                    args: options.logArgs ? args : undefined,
                    params: options.logParams ? args.map(arg => typeof arg === 'object' ? '[object]' : arg) : undefined
                });

                const result = await originalMethod.apply(this, args);
                const duration = Date.now() - startTime;

                logger.database(`[DB] ${operation} completed on ${table}`, {
                    operationId,
                    operation,
                    table,
                    duration: `${duration}ms`,
                    success: true,
                    resultCount: Array.isArray(result) ? result.length : 1
                });

                return result;
            } catch (error) {
                const duration = Date.now() - startTime;

                logger.database(`[DB] ${operation} failed on ${table}`, {
                    operationId,
                    operation,
                    table,
                    duration: `${duration}ms`,
                    success: false,
                    error: error.message,
                    errorCode: error.code
                });

                throw error;
            }
        };

        return descriptor;
    };
}

/**
 * 缓存操作日志装饰器
 */
function logCacheOperation(operation, keyPattern) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function(...args) {
            const startTime = Date.now();
            const operationId = generateRequestId();

            try {
                const key = args[0] || keyPattern;
                const hit = operation.toLowerCase().includes('get');

                const result = await originalMethod.apply(this, args);
                const duration = Date.now() - startTime;

                logger.cache(`[CACHE] ${operation} ${key}`, operation, `${duration}ms`, {
                    operationId,
                    operation,
                    key: maskSensitiveValue(key),
                    hit: hit ? !!result : undefined,
                    duration,
                    success: true
                });

                return result;
            } catch (error) {
                const duration = Date.now() - startTime;

                logger.cache(`[CACHE] ${operation} failed`, operation, `${duration}ms`, {
                    operationId,
                    operation,
                    duration,
                    success: false,
                    error: error.message
                });

                throw error;
            }
        };

        return descriptor;
    };
}

module.exports = {
    loggingMiddleware,
    logDatabaseOperation,
    logCacheOperation
};