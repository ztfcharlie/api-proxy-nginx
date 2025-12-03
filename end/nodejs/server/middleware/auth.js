const jwt = require('jsonwebtoken');
const LoggerService = require('../services/LoggerService');

const logger = LoggerService;

class AuthMiddleware {
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production';
        this.jwtAlgorithm = process.env.JWT_ALGORITHM || 'RS256';
        this.bearerTokenRegex = /^Bearer\s+(.+)$/i;
    }

    // 验证访问令牌中间件
    verifyAccessToken(options = {}) {
        const {
            required = true,
            scopes = [],
            audience = process.env.OAUTH2_AUDIENCE,
            issuer = process.env.OAUTH2_ISSUER,
            revokeCheck = true
        } = options;

        return async (req, res, next) => {
            try {
                const startTime = Date.now();

                // 提取访问令牌
                const authHeader = req.headers.authorization || req.headers.Authorization;
                if (!authHeader) {
                    if (required) {
                        return this.unauthorizedResponse(res, 'Missing Authorization header', 'missing_token');
                    }
                    return next();
                }

                const match = authHeader.match(this.bearerTokenRegex);
                if (!match) {
                    return this.unauthorizedResponse(res, 'Invalid Authorization header format', 'invalid_token_format');
                }

                const accessToken = match[1];

                // 验证 JWT 令牌
                let decoded;
                try {
                    decoded = jwt.verify(accessToken, this.jwtSecret, {
                        algorithms: [this.jwtAlgorithm],
                        audience: audience,
                        issuer: issuer
                    });
                } catch (jwtError) {
                    const errorType = this.getJWTErrorType(jwtError);
                    return this.unauthorizedResponse(res, jwtError.message, errorType);
                }

                // 检查令牌类型
                if (decoded.token_use !== 'access') {
                    return this.unauthorizedResponse(res, 'Invalid token type', 'invalid_token_type');
                }

                // 检查作用域（如果指定）
                if (scopes.length > 0) {
                    const tokenScopes = decoded.scopes || [];
                    const missingScopes = scopes.filter(scope => !tokenScopes.includes(scope));
                    if (missingScopes.length > 0) {
                        return this.forbiddenResponse(res, `Insufficient scopes: ${missingScopes.join(', ')}`, 'insufficient_scope');
                    }
                }

                // 检查令牌是否已被撤销（如果启用）
                if (revokeCheck) {
                    const isRevoked = await this.checkTokenRevoked(accessToken);
                    if (isRevoked) {
                        return this.unauthorizedResponse(res, 'Token has been revoked', 'token_revoked');
                    }
                }

                // 更新请求对象
                req.auth = {
                    client_id: decoded.client_id,
                    service_type: decoded.service_type,
                    scopes: decoded.scopes || [],
                    iat: decoded.iat,
                    exp: decoded.exp,
                    iss: decoded.iss,
                    aud: decoded.aud,
                    sub: decoded.sub
                };

                const duration = Date.now() - startTime;
                logger.performance('verifyAccessToken', duration, {
                    client_id: decoded.client_id,
                    token_type: 'access',
                    scopes: decoded.scopes
                });

                next();
            } catch (error) {
                logger.error('Error in access token verification middleware:', error);
                return this.serverErrorResponse(res, 'Authentication failed', 'auth_error');
            }
        };
    }

    // 验证客户端凭证中间件
    verifyClientCredentials() {
        return async (req, res, next) => {
            try {
                const startTime = Date.now();

                // 检查客户端认证头
                const authHeader = req.headers.authorization || req.headers.Authorization;
                if (!authHeader) {
                    return this.unauthorizedResponse(res, 'Missing client credentials', 'missing_client_credentials');
                }

                // Basic 认证
                if (authHeader.startsWith('Basic ')) {
                    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
                    const [clientId, clientSecret] = credentials.split(':');

                    if (!clientId || !clientSecret) {
                        return this.unauthorizedResponse(res, 'Invalid client credentials format', 'invalid_client_credentials');
                    }

                    // 验证客户端凭证
                    const authResult = await this.authenticateClient(clientId, clientSecret);
                    if (!authResult.success) {
                        return this.unauthorizedResponse(res, authResult.description, authResult.error);
                    }

                    req.auth = {
                        client_id: authResult.client.client_id,
                        service_type: authResult.client.service_type,
                        client_info: authResult.client
                    };
                }
                // Bearer 令牌认证
                else {
                    const match = authHeader.match(this.bearerTokenRegex);
                    if (!match) {
                        return this.unauthorizedResponse(res, 'Invalid Authorization header format', 'invalid_auth_format');
                    }

                    const accessToken = match[1];
                    const tokenResult = await this.verifyAccessTokenWithDb(accessToken);
                    if (!tokenResult.success) {
                        return this.unauthorizedResponse(res, tokenResult.description, tokenResult.error);
                    }

                    req.auth = {
                        client_id: tokenResult.client_info.client_id,
                        service_type: tokenResult.client_info.service_type,
                        client_info: tokenResult.client_info,
                        token_info: tokenResult.token_info
                    };
                }

                const duration = Date.now() - startTime;
                logger.performance('verifyClientCredentials', duration, {
                    client_id: req.auth.client_id
                });

                next();
            } catch (error) {
                logger.error('Error in client credentials verification middleware:', error);
                return this.serverErrorResponse(res, 'Client authentication failed', 'client_auth_error');
            }
        };
    }

    // 验证刷新令牌中间件
    verifyRefreshToken() {
        return async (req, res, next) => {
            try {
                const { refresh_token } = req.body;

                if (!refresh_token) {
                    return this.badRequestResponse(res, 'Missing refresh token', 'missing_refresh_token');
                }

                // 验证刷新令牌
                const refreshResult = await this.verifyRefreshTokenWithDb(refresh_token);
                if (!refreshResult.success) {
                    return this.unauthorizedResponse(res, refreshResult.description, refreshResult.error);
                }

                req.auth = {
                    client_id: refreshResult.client_info.client_id,
                    service_type: refreshResult.client_info.service_type,
                    client_info: refreshResult.client_info,
                    refresh_token_info: refreshResult.refresh_token_info
                };

                next();
            } catch (error) {
                logger.error('Error in refresh token verification middleware:', error);
                return this.serverErrorResponse(res, 'Refresh token verification failed', 'refresh_token_error');
            }
        };
    }

    // 管理员权限检查中间件
    requireAdmin() {
        return async (req, res, next) => {
            try {
                if (!req.auth) {
                    return this.unauthorizedResponse(res, 'Authentication required', 'auth_required');
                }

                // 检查是否为管理员（这里可以自定义管理员检查逻辑）
                const isAdmin = await this.checkAdminPermission(req.auth.client_id);
                if (!isAdmin) {
                    return this.forbiddenResponse(res, 'Admin permission required', 'admin_required');
                }

                req.auth.is_admin = true;
                next();
            } catch (error) {
                logger.error('Error in admin permission check:', error);
                return this.serverErrorResponse(res, 'Permission check failed', 'permission_error');
            }
        };
    }

    // 可选认证中间件
    optionalAuth() {
        return this.verifyAccessToken({ required: false });
    }

    // 检查作用域中间件
    requireScopes(scopes) {
        return async (req, res, next) => {
            try {
                if (!req.auth) {
                    return this.unauthorizedResponse(res, 'Authentication required', 'auth_required');
                }

                const tokenScopes = req.auth.scopes || [];
                const missingScopes = scopes.filter(scope => !tokenScopes.includes(scope));
                if (missingScopes.length > 0) {
                    return this.forbiddenResponse(res, `Insufficient scopes: ${missingScopes.join(', ')}`, 'insufficient_scope');
                }

                next();
            } catch (error) {
                logger.error('Error in scope verification:', error);
                return this.serverErrorResponse(res, 'Scope verification failed', 'scope_error');
            }
        };
    }

    // 验证服务账号权限中间件
    requireServiceAccount(serviceAccountIds = []) {
        return async (req, res, next) => {
            try {
                if (!req.auth || !req.auth.token_info) {
                    return this.unauthorizedResponse(res, 'Token information required', 'token_info_required');
                }

                if (serviceAccountIds.length > 0) {
                    const hasPermission = serviceAccountIds.includes(req.auth.token_info.server_account_id);
                    if (!hasPermission) {
                        return this.forbiddenResponse(res, 'Service account access denied', 'service_account_denied');
                    }
                }

                next();
            } catch (error) {
                logger.error('Error in service account verification:', error);
                return this.serverErrorResponse(res, 'Service account verification failed', 'service_account_error');
            }
        };
    }

    // 验证数据库中的访问令牌
    async verifyAccessTokenWithDb(accessToken) {
        try {
            // 这里应该调用 TokenService 或数据库查询
            const DatabaseService = require('../services/DatabaseService');
            const db = new DatabaseService();
            await db.initialize();

            const query = `
                SELECT tm.*, c.client_id, c.service_type, c.enable,
                       sa.project_id, sa.client_email
                FROM token_mappings tm
                JOIN clients c ON tm.client_token = c.client_token
                LEFT JOIN server_accounts sa ON tm.server_account_id = sa.id
                WHERE tm.google_access_token = ? AND tm.status = 'active' AND c.enable = TRUE
                AND tm.expires_at > NOW()
            `;

            const results = await db.query(query, [accessToken]);
            await db.close();

            if (!results || results.length === 0) {
                return { success: false, error: 'invalid_token', description: 'Invalid or expired access token' };
            }

            const mapping = results[0];

            return {
                success: true,
                client_info: {
                    client_id: mapping.client_id,
                    service_type: mapping.service_type,
                    enable: mapping.enable
                },
                token_info: {
                    mapping_id: mapping.id,
                    server_account_id: mapping.server_account_id,
                    project_id: mapping.project_id,
                    client_email: mapping.client_email,
                    expires_at: mapping.expires_at,
                    scopes: mapping.scope ? JSON.parse(mapping.scope) : []
                }
            };
        } catch (error) {
            logger.error('Error verifying access token with database:', error);
            return { success: false, error: 'server_error', description: 'Database verification failed' };
        }
    }

    // 验证数据库中的刷新令牌
    async verifyRefreshTokenWithDb(refreshToken) {
        try {
            const DatabaseService = require('../services/DatabaseService');
            const db = new DatabaseService();
            await db.initialize();

            const query = `
                SELECT tm.*, c.client_id, c.service_type, c.enable,
                       sa.project_id, sa.client_email
                FROM token_mappings tm
                JOIN clients c ON tm.client_token = c.client_token
                LEFT JOIN server_accounts sa ON tm.server_account_id = sa.id
                WHERE tm.google_refresh_token = ? AND tm.status = 'active' AND c.enable = TRUE
            `;

            const results = await db.query(query, [refreshToken]);
            await db.close();

            if (!results || results.length === 0) {
                return { success: false, error: 'invalid_grant', description: 'Invalid refresh token' };
            }

            const mapping = results[0];

            return {
                success: true,
                client_info: {
                    client_id: mapping.client_id,
                    service_type: mapping.service_type,
                    enable: mapping.enable
                },
                refresh_token_info: {
                    mapping_id: mapping.id,
                    server_account_id: mapping.server_account_id,
                    project_id: mapping.project_id,
                    client_email: mapping.client_email,
                    created_at: mapping.created_at
                }
            };
        } catch (error) {
            logger.error('Error verifying refresh token with database:', error);
            return { success: false, error: 'server_error', description: 'Database verification failed' };
        }
    }

    // 验证客户端凭证
    async authenticateClient(clientId, clientSecret) {
        try {
            // 这里应该实现客户端认证逻辑
            const DatabaseService = require('../services/DatabaseService');
            const db = new DatabaseService();
            await db.initialize();

            const query = `
                SELECT id, client_id, client_secret_hash, service_type, enable, rate_limit
                FROM clients
                WHERE client_id = ? AND enable = TRUE
            `;

            const results = await db.query(query, [clientId]);
            await db.close();

            if (!results || results.length === 0) {
                return { success: false, error: 'invalid_client', description: 'Client not found or disabled' };
            }

            const client = results[0];

            // 验证客户端密钥（这里应该使用密码哈希）
            if (client.client_secret_hash !== this.hashSecret(clientSecret)) {
                return { success: false, error: 'invalid_client', description: 'Invalid client credentials' };
            }

            return { success: true, client };
        } catch (error) {
            logger.error('Error authenticating client:', error);
            return { success: false, error: 'server_error', description: 'Client authentication failed' };
        }
    }

    // 检查令牌是否已撤销
    async checkTokenRevoked(accessToken) {
        try {
            const DatabaseService = require('../services/DatabaseService');
            const db = new DatabaseService();
            await db.initialize();

            const query = `
                SELECT status FROM token_mappings
                WHERE google_access_token = ?
            `;

            const results = await db.query(query, [this.hashToken(accessToken)]);
            await db.close();

            if (!results || results.length === 0) {
                return true; // 未知令牌视为已撤销
            }

            const mapping = results[0];
            return mapping.status !== 'active';
        } catch (error) {
            logger.error('Error checking token revocation:', error);
            return true; // 出错时保守处理，视为已撤销
        }
    }

    // 检查管理员权限
    async checkAdminPermission(clientId) {
        try {
            // 这里应该实现管理员权限检查逻辑
            // 可以从数据库查询管理员配置，或者硬编码管理员列表
            const adminClients = process.env.ADMIN_CLIENT_IDS ?
                process.env.ADMIN_CLIENT_IDS.split(',') :
                [];

            return adminClients.includes(clientId);
        } catch (error) {
            logger.error('Error checking admin permission:', error);
            return false;
        }
    }

    // 获取 JWT 错误类型
    getJWTErrorType(error) {
        if (error.name === 'TokenExpiredError') {
            return 'token_expired';
        }
        if (error.name === 'JsonWebTokenError') {
            return 'invalid_token';
        }
        if (error.name === 'NotBeforeError') {
            return 'token_not_before';
        }
        return 'jwt_error';
    }

    // 哈希令牌
    hashToken(token) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    // 哈希密钥
    hashSecret(secret) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(secret).digest('hex');
    }

    // 响应方法
    unauthorizedResponse(res, message, error) {
        return res.status(401).json({
            error: 'unauthorized',
            message: message,
            error_code: error,
            timestamp: new Date().toISOString()
        });
    }

    forbiddenResponse(res, message, error) {
        return res.status(403).json({
            error: 'forbidden',
            message: message,
            error_code: error,
            timestamp: new Date().toISOString()
        });
    }

    badRequestResponse(res, message, error) {
        return res.status(400).json({
            error: 'bad_request',
            message: message,
            error_code: error,
            timestamp: new Date().toISOString()
        });
    }

    serverErrorResponse(res, message, error) {
        return res.status(500).json({
            error: 'server_error',
            message: message,
            error_code: error,
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = new AuthMiddleware();