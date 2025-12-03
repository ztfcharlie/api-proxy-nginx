const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const LoggerService = require('../services/LoggerService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const logger = LoggerService;
const auth = authMiddleware;

// 模拟 Google OAuth2 令牌端点
// 对应: https://oauth2.googleapis.com/token
router.post('/token', async (req, res) => {
    const startTime = Date.now();
    const requestId = req.requestId || crypto.randomBytes(16).toString('hex');

    try {
        // 记录原始请求
        logger.oauth2(`[OAUTH2] Token request received`, {
            requestId,
            method: req.method,
            url: req.originalUrl,
            headers: sanitizeOAuth2Headers(req.headers),
            body: sanitizeOAuth2Body(req.body),
            ip: getClientIP(req),
            userAgent: req.headers['user-agent']
        });

        // 验证基本参数
        const grantType = req.body.grant_type;
        if (!grantType) {
            const errorResponse = {
                error: 'invalid_request',
                error_description: 'Missing grant_type parameter',
                timestamp: new Date().toISOString()
            };

            logger.oauth2(`[OAUTH2] Missing grant_type`, {
                requestId,
                status: 400,
                response: errorResponse
            });

            return res.status(400).json(errorResponse);
        }

        let result;

        // 根据授权类型处理
        switch (grantType) {
            case 'authorization_code':
                result = await handleAuthorizationCodeGrant(req, requestId);
                break;
            case 'refresh_token':
                result = await handleRefreshTokenGrant(req, requestId);
                break;
            case 'urn:ietf:params:oauth:grant-type:jwt-bearer':
                result = await handleJWTBearerGrant(req, requestId);
                break;
            case 'client_credentials':
                result = await handleClientCredentialsGrant(req, requestId);
                break;
            default:
                result = {
                    success: false,
                    error: 'unsupported_grant_type',
                    error_description: `Grant type "${grantType}" is not supported`,
                    statusCode: 400
                };
        }

        // 记录处理结果
        const duration = Date.now() - startTime;
        logger.oauth2(`[OAUTH2] Token request completed`, {
            requestId,
            grantType,
            success: result.success,
            statusCode: result.statusCode || 500,
            duration: `${duration}ms`,
            error: result.error,
            description: result.error_description
        });

        // 记录到数据库
        await logOAuth2Request({
            request_id: requestId,
            grant_type: grantType,
            client_id: extractClientId(req),
            request_method: req.method,
            request_url: req.originalUrl,
            request_headers: req.headers,
            request_body: req.body,
            status_code: result.statusCode || 500,
            success: result.success,
            error_code: result.error,
            error_message: result.error_description,
            processing_time: duration,
            request_ip: getClientIP(req),
            user_agent: req.headers['user-agent']
        });

        // 设置响应头
        const cacheHeaders = {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        };

        if (result.success) {
            // 记录令牌生成日志
            logger.tokenOperation('CREATE', result.token_type || 'access_token', extractClientId(req), {
                requestId,
                expiresIn: result.expires_in,
                scopes: result.scope
            });

            res.locals.responseData = result;

            return res.status(200)
                .set(cacheHeaders)
                .set({
                    'Content-Type': 'application/json',
                    'X-OAuth2-Request-ID': requestId,
                    'X-Grant-Type': grantType
                })
                .json({
                    access_token: result.access_token,
                    token_type: result.token_type || 'Bearer',
                    expires_in: result.expires_in,
                    refresh_token: result.refresh_token,
                    scope: result.scope
                });
        } else {
            return res.status(result.statusCode || 500)
                .set(cacheHeaders)
                .set({
                    'Content-Type': 'application/json',
                    'X-OAuth2-Request-ID': requestId,
                    'X-Grant-Type': grantType
                })
                .json({
                    error: result.error,
                    error_description: result.error_description,
                    error_uri: result.error_uri || null
                });
        }

    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`[OAUTH2] Token request failed`, {
            requestId,
            error: error.message,
            stack: error.stack,
            duration: `${duration}ms`
        });

        return res.status(500).json({
            error: 'server_error',
            error_description: 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
});

// 模拟 Google OAuth2 授权端点
// 对应: https://accounts.google.com/o/oauth2/auth
router.get('/auth', async (req, res) => {
    const startTime = Date.now();
    const requestId = req.requestId || crypto.randomBytes(16).toString('hex');

    try {
        logger.oauth2(`[OAUTH2] Authorization request received`, {
            requestId,
            method: req.method,
            url: req.originalUrl,
            query: req.query,
            ip: getClientIP(req),
            userAgent: req.headers['user-agent']
        });

        // 验证必需参数
        const responseType = req.query.response_type;
        const clientId = req.query.client_id;
        const redirectUri = req.query.redirect_uri;

        if (!responseType || !clientId) {
            const errorParams = new URLSearchParams({
                error: 'invalid_request',
                error_description: 'Missing required parameters'
            });

            return res.redirect(`${req.query.redirect_uri || '/'}?${errorParams}`);
        }

        // 生成授权码（简化处理）
        const authCode = generateAuthCode();
        const expiresIn = parseInt(process.env.OAUTH2_CODE_EXPIRES) || 600;

        // 存储授权码（这里应该存储到数据库）
        await storeAuthorizationCode(authCode, clientId, redirectUri, expiresIn);

        // 重定向到回调URL
        const params = new URLSearchParams({
            code: authCode,
            state: req.query.state || null
        });

        const redirectUrl = `${redirectUri}?${params}`;

        // 记录授权请求
        const duration = Date.now() - startTime;
        logger.oauth2(`[OAUTH2] Authorization request completed`, {
            requestId,
            responseType,
            clientId,
            redirectUri,
            authCode: authCode.substring(0, 8) + '****',
            duration: `${duration}ms`,
            success: true
        });

        return res.redirect(redirectUrl);

    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`[OAUTH2] Authorization request failed`, {
            requestId,
            error: error.message,
            duration: `${duration}ms`
        });

        const errorParams = new URLSearchParams({
            error: 'server_error',
            error_description: 'Internal server error'
        });

        return res.redirect(`${req.query.redirect_uri || '/'}?${errorParams}`);
    }
});

// 模拟 Google OAuth2 证书端点
// 对应: https://www.googleapis.com/oauth2/v1/certs
router.get('/v1/certs', async (req, res) => {
    const startTime = Date.now();
    const requestId = req.requestId || crypto.randomBytes(16).toString('hex');

    try {
        logger.oauth2(`[OAUTH2] Certificate request received`, {
            requestId,
            method: req.method,
            url: req.originalUrl,
            ip: getClientIP(req),
            userAgent: req.headers['user-agent']
        });

        // 生成模拟的 Google 证书
        const certificates = generateGoogleCertificates();

        const duration = Date.now() - startTime;
        logger.oauth2(`[OAUTH2] Certificate request completed`, {
            requestId,
            certificateCount: certificates.keys.length,
            duration: `${duration}ms`,
            success: true
        });

        return res.status(200)
            .set({
                'Cache-Control': 'public, max-age=3600',
                'ETag': crypto.createHash('md5').update(JSON.stringify(certificates)).digest('hex'),
                'X-OAuth2-Request-ID': requestId
            })
            .json(certificates);

    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`[OAUTH2] Certificate request failed`, {
            requestId,
            error: error.message,
            duration: `${duration}ms`
        });

        return res.status(500).json({
            error: 'server_error',
            error_description: 'Failed to retrieve certificates',
            timestamp: new Date().toISOString()
        });
    }
});

// 模拟 Google 服务账号证书端点
// 对应: https://www.googleapis.com/robot/v1/metadata/x509/{service-account}
router.get('/robot/v1/metadata/x509/:serviceAccount', async (req, res) => {
    const startTime = Date.now();
    const requestId = req.requestId || crypto.randomBytes(16).toString('hex');
    const { serviceAccount } = req.params;

    try {
        logger.oauth2(`[OAUTH2] Service account certificate request received`, {
            requestId,
            method: req.method,
            url: req.originalUrl,
            serviceAccount,
            ip: getClientIP(req),
            userAgent: req.headers['user-agent']
        });

        // 查找服务账号信息
        const serverAccount = await findServerAccount(serviceAccount);
        if (!serverAccount) {
            const duration = Date.now() - startTime;
            logger.oauth2(`[OAUTH2] Service account not found`, {
                requestId,
                serviceAccount,
                duration: `${duration}ms`,
                success: false
            });

            return res.status(404).json({
                error: 'not_found',
                message: 'Service account not found',
                timestamp: new Date().toISOString()
            });
        }

        // 生成 X.509 证书
        const certificate = generateX509Certificate(serverAccount);

        const duration = Date.now() - startTime;
        logger.oauth2(`[OAUTH2] Service account certificate request completed`, {
            requestId,
            serviceAccount,
            certificateId: certificate.id,
            duration: `${duration}ms`,
            success: true
        });

        return res.status(200)
            .set({
                'Cache-Control': 'public, max-age=3600',
                'ETag': crypto.createHash('md5').update(certificate.pem).digest('hex'),
                'X-OAuth2-Request-ID': requestId,
                'X-Service-Account': serviceAccount
            })
            .json(certificate);

    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`[OAUTH2] Service account certificate request failed`, {
            requestId,
            serviceAccount,
            error: error.message,
            duration: `${duration}ms`
        });

        return res.status(500).json({
            error: 'server_error',
            error_description: 'Failed to retrieve service account certificate',
            timestamp: new Date().toISOString()
        });
    }
});

// 处理授权码授权类型
async function handleAuthorizationCodeGrant(req, requestId) {
    try {
        const { code, redirect_uri, client_id, client_secret } = req.body;

        if (!code || !client_id) {
            return {
                success: false,
                error: 'invalid_request',
                error_description: 'Missing required parameters',
                statusCode: 400
            };
        }

        // 验证授权码
        const authCode = await validateAuthorizationCode(code, client_id, redirect_uri);
        if (!authCode) {
            return {
                success: false,
                error: 'invalid_grant',
                error_description: 'Invalid authorization code',
                statusCode: 400
            };
        }

        // 获取客户端信息
        const client = await getClientByCredentials(client_id, client_secret);
        if (!client) {
            return {
                success: false,
                error: 'invalid_client',
                error_description: 'Invalid client credentials',
                statusCode: 401
            };
        }

        // 生成访问令牌
        const tokenService = require('../services/TokenService');
        const tokens = await tokenService.createTokenMapping(client.client_token, authCode.server_account_id);

        if (!tokens.success) {
            return {
                success: false,
                error: 'server_error',
                error_description: 'Failed to generate tokens',
                statusCode: 500
            };
        }

        return {
            success: true,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_type: 'Bearer',
            expires_in: tokens.expires_in,
            scope: authCode.scope
        };

    } catch (error) {
        logger.error(`[OAUTH2] Authorization code grant failed:`, error);
        return {
            success: false,
            error: 'server_error',
            error_description: 'Authorization code flow failed',
            statusCode: 500
        };
    }
}

// 处理刷新令牌授权类型
async function handleRefreshTokenGrant(req, requestId) {
    try {
        const { refresh_token, client_id, client_secret } = req.body;

        if (!refresh_token || !client_id) {
            return {
                success: false,
                error: 'invalid_request',
                error_description: 'Missing required parameters',
                statusCode: 400
            };
        }

        // 验证客户端凭证
        const client = await getClientByCredentials(client_id, client_secret);
        if (!client) {
            return {
                success: false,
                error: 'invalid_client',
                error_description: 'Invalid client credentials',
                statusCode: 401
            };
        }

        // 刷新令牌
        const tokenService = require('../services/TokenService');
        const tokens = await tokenService.refreshTokenMapping(refresh_token);

        if (!tokens.success) {
            return {
                success: false,
                error: tokens.error,
                error_description: tokens.description || 'Token refresh failed',
                statusCode: 400
            };
        }

        return {
            success: true,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_type: 'Bearer',
            expires_in: tokens.expires_in
        };

    } catch (error) {
        logger.error(`[OAUTH2] Refresh token grant failed:`, error);
        return {
            success: false,
            error: 'server_error',
            error_description: 'Refresh token flow failed',
            statusCode: 500
        };
    }
}

// 处理 JWT Bearer 授权类型（服务账号认证）
async function handleJWTBearerGrant(req, requestId) {
    try {
        const { assertion, scope } = req.body;

        if (!assertion) {
            return {
                success: false,
                error: 'invalid_request',
                error_description: 'Missing required parameter: assertion',
                statusCode: 400
            };
        }

        // 验证 JWT 断言
        const jwtPayload = await validateJWTAssertion(assertion);
        if (!jwtPayload) {
            return {
                success: false,
                error: 'invalid_grant',
                error_description: 'Invalid JWT assertion',
                statusCode: 400
            };
        }

        // 查找服务账号
        const serverAccount = await findServerAccountByEmail(jwtPayload.iss);
        if (!serverAccount) {
            return {
                success: false,
                error: 'invalid_grant',
                error_description: 'Service account not found',
                statusCode: 400
            };
        }

        // 获取关联的客户端
        const client = await getClientByServerAccount(serverAccount.id);
        if (!client) {
            return {
                success: false,
                error: 'invalid_client',
                error_description: 'No client associated with this service account',
                statusCode: 401
            };
        }

        // 生成访问令牌
        const tokenService = require('../services/TokenService');
        const tokens = await tokenService.createTokenMapping(
            client.client_token,
            serverAccount.id,
            {
                scopes: scope ? scope.split(' ') : ['https://www.googleapis.com/auth/cloud-platform'],
                requestIp: getClientIP(req),
                userAgent: req.headers['user-agent'],
                grantType: 'jwt_bearer',
                assertion: jwtPayload
            }
        );

        if (!tokens.success) {
            return {
                success: false,
                error: 'server_error',
                error_description: 'Failed to generate tokens',
                statusCode: 500
            };
        }

        return {
            success: true,
            access_token: tokens.access_token,
            token_type: 'Bearer',
            expires_in: tokens.expires_in,
            scope: tokens.scope
        };

    } catch (error) {
        logger.error(`[OAUTH2] JWT Bearer grant failed:`, error);
        return {
            success: false,
            error: 'server_error',
            error_description: 'JWT Bearer flow failed',
            statusCode: 500
        };
    }
}

// 处理客户端凭证授权类型
async function handleClientCredentialsGrant(req, requestId) {
    try {
        const { client_id, client_secret, scope } = req.body;

        if (!client_id || !client_secret) {
            return {
                success: false,
                error: 'invalid_request',
                error_description: 'Missing required parameters',
                statusCode: 400
            };
        }

        // 验证客户端凭证
        const client = await getClientByCredentials(client_id, client_secret);
        if (!client) {
            return {
                success: false,
                error: 'invalid_client',
                error_description: 'Invalid client credentials',
                statusCode: 401
            };
        }

        // 生成访问令牌（需要关联一个服务账号）
        const serverAccount = await getDefaultServerAccount(client.id);
        if (!serverAccount) {
            return {
                success: false,
                error: 'invalid_client',
                error_description: 'No service account associated with this client',
                statusCode: 401
            };
        }

        // 生成访问令牌
        const tokenService = require('../services/TokenService');
        const tokens = await tokenService.createTokenMapping(
            client.client_token,
            serverAccount.id,
            {
                scopes: scope ? scope.split(' ') : ['https://www.googleapis.com/auth/cloud-platform'],
                requestIp: getClientIP(req),
                userAgent: req.headers['user-agent'],
                grantType: 'client_credentials'
            }
        );

        if (!tokens.success) {
            return {
                success: false,
                error: 'server_error',
                error_description: 'Failed to generate tokens',
                statusCode: 500
            };
        }

        return {
            success: true,
            access_token: tokens.access_token,
            token_type: 'Bearer',
            expires_in: tokens.expires_in,
            scope: tokens.scope
        };

    } catch (error) {
        logger.error(`[OAUTH2] Client credentials grant failed:`, error);
        return {
            success: false,
            error: 'server_error',
            error_description: 'Client credentials flow failed',
            statusCode: 500
        };
    }
}

// 辅助函数
function generateAuthCode() {
    return crypto.randomBytes(32).toString('base64url');
}

async function storeAuthorizationCode(code, clientId, redirectUri, expiresIn) {
    // 这里应该存储到数据库
    // 简化处理：生成简单的授权码信息
    return {
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        expires_at: new Date(Date.now() + expiresIn * 1000),
        server_account_id: 1 // 默认服务账号
    };
}

async function validateAuthorizationCode(code, clientId, redirectUri) {
    // 这里应该从数据库验证
    // 简化处理：返回默认授权码信息
    return {
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        server_account_id: 1,
        scope: 'https://www.googleapis.com/auth/cloud-platform'
    };
}

async function getClientByCredentials(clientId, clientSecret) {
    try {
        const DatabaseService = require('../services/DatabaseService');
        const db = new DatabaseService();
        await db.initialize();

        const query = `
            SELECT c.*, sa.id as default_server_account_id
            FROM clients c
            LEFT JOIN server_accounts sa ON c.id = sa.client_id AND sa.enable = TRUE
            WHERE c.client_id = ? AND c.enable = TRUE
            LIMIT 1
        `;

        const results = await db.query(query, [clientId]);
        await db.close();

        if (!results || results.length === 0) {
            return null;
        }

        // 验证客户端密钥（简化处理）
        // 实际应该使用密码哈希
        return results[0];
    } catch (error) {
        logger.error('Error getting client by credentials:', error);
        return null;
    }
}

async function getClientByServerAccount(serverAccountId) {
    try {
        const DatabaseService = require('../services/DatabaseService');
        const db = new DatabaseService();
        await db.initialize();

        const query = `
            SELECT c.*
            FROM clients c
            JOIN server_accounts sa ON c.id = sa.client_id
            WHERE sa.id = ? AND c.enable = TRUE AND sa.enable = TRUE
        `;

        const results = await db.query(query, [serverAccountId]);
        await db.close();

        return results.length > 0 ? results[0] : null;
    } catch (error) {
        logger.error('Error getting client by server account:', error);
        return null;
    }
}

async function getDefaultServerAccount(clientId) {
    try {
        const DatabaseService = require('../services/DatabaseService');
        const db = new DatabaseService();
        await db.initialize();

        const query = `
            SELECT sa.*
            FROM server_accounts sa
            WHERE sa.client_id = ? AND sa.enable = TRUE
            ORDER BY sa.key_weight ASC, sa.id ASC
            LIMIT 1
        `;

        const results = await db.query(query, [clientId]);
        await db.close();

        return results.length > 0 ? results[0] : null;
    } catch (error) {
        logger.error('Error getting default server account:', error);
        return null;
    }
}

async function findServerAccount(serviceAccount) {
    try {
        const DatabaseService = require('../services/DatabaseService');
        const db = new DatabaseService();
        await db.initialize();

        const query = `
            SELECT sa.*, c.client_token, c.service_type
            FROM server_accounts sa
            JOIN clients c ON sa.client_id = c.id
            WHERE sa.client_email = ? AND sa.enable = TRUE AND c.enable = TRUE
        `;

        const results = await db.query(query, [serviceAccount]);
        await db.close();

        return results.length > 0 ? results[0] : null;
    } catch (error) {
        logger.error('Error finding server account:', error);
        return null;
    }
}

async function findServerAccountByEmail(email) {
    try {
        const DatabaseService = require('../services/DatabaseService');
        const db = new DatabaseService();
        await db.initialize();

        const query = `
            SELECT sa.*, c.client_token, c.service_type
            FROM server_accounts sa
            JOIN clients c ON sa.client_id = c.id
            WHERE sa.client_email = ? AND sa.enable = TRUE AND c.enable = TRUE
        `;

        const results = await db.query(query, [email]);
        await db.close();

        return results.length > 0 ? results[0] : null;
    } catch (error) {
        logger.error('Error finding server account by email:', error);
        return null;
    }
}

async function validateJWTAssertion(assertion) {
    try {
        // 这里应该验证 JWT 签名和内容
        // 简化处理：解码 JWT
        const decoded = jwt.decode(assertion, { complete: true });

        if (!decoded || !decoded.header || !decoded.payload) {
            return null;
        }

        // 检查必要的字段
        const payload = decoded.payload;
        if (!payload.iss || !payload.scope || !payload.aud || !payload.exp) {
            return null;
        }

        // 检查过期时间
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
            return null;
        }

        return payload;
    } catch (error) {
        logger.error('Error validating JWT assertion:', error);
        return null;
    }
}

function generateGoogleCertificates() {
    return {
        keys: [
            {
                kty: 'RSA',
                alg: 'RS256',
                use: 'sig',
                kid: 'mock-key-id-1',
                n: 'mock-modulus-base64-encoded-value',
                e: 'AQAB'
            },
            {
                kty: 'RSA',
                alg: 'RS256',
                use: 'sig',
                kid: 'mock-key-id-2',
                n: 'mock-modulus-base64-encoded-value-2',
                e: 'AQAB'
            }
        ]
    };
}

function generateX509Certificate(serverAccount) {
    const certificateId = crypto.randomBytes(16).toString('hex');
    const certificatePem = `-----BEGIN CERTIFICATE-----
MIIC...${certificateId}... (Mock X.509 Certificate)
-----END CERTIFICATE-----`;

    return {
        id: certificateId,
        client_email: serverAccount.client_email,
        private_key_id: serverAccount.private_key_id,
        public_key: certificatePem,
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    };
}

async function logOAuth2Request(logData) {
    try {
        const DatabaseService = require('../services/DatabaseService');
        const db = new DatabaseService();
        await db.initialize();

        const query = `
            INSERT INTO oauth_logs (
                client_id, server_account_id, token_mapping_id,
                request_type, request_method, request_url,
                request_headers, request_body, status_code,
                success, error_code, error_message,
                processing_time, request_ip, user_agent,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        // 查找客户端 ID（简化处理）
        const clientId = logData.client_id ? await getClientId(logData.client_id) : null;
        const serverAccountId = await getServerAccountIdByClientId(logData.client_id);

        await db.query(query, [
            clientId,
            serverAccountId,
            null, // token_mapping_id, 稍后更新
            logData.grant_type,
            logData.request_method,
            logData.request_url,
            JSON.stringify(logData.request_headers),
            JSON.stringify(logData.request_body),
            logData.status_code,
            logData.success,
            logData.error_code,
            logData.error_message,
            logData.processing_time,
            logData.request_ip,
            logData.user_agent
        ]);

        await db.close();
    } catch (error) {
        logger.error('Error logging OAuth2 request:', error);
    }
}

async function getClientId(clientId) {
    try {
        const DatabaseService = require('../services/DatabaseService');
        const db = new DatabaseService();
        await db.initialize();

        const results = await db.query('SELECT id FROM clients WHERE client_id = ?', [clientId]);
        await db.close();

        return results.length > 0 ? results[0].id : null;
    } catch (error) {
        return null;
    }
}

async function getServerAccountIdByClientId(clientId) {
    try {
        const DatabaseService = require('../services/DatabaseService');
        const db = new DatabaseService();
        await db.initialize();

        const results = await db.query('SELECT id FROM server_accounts WHERE client_id = (SELECT id FROM clients WHERE client_id = ?) AND enable = TRUE LIMIT 1', [clientId]);
        await db.close();

        return results.length > 0 ? results[0].id : null;
    } catch (error) {
        return null;
    }
}

function extractClientId(req) {
    // 从请求体提取
    if (req.body && req.body.client_id) {
        return req.body.client_id;
    }

    // 从 Authorization 头提取（Basic 认证）
    if (req.headers.authorization) {
        const authParts = req.headers.authorization.split(' ');
        if (authParts[0] === 'Basic' && authParts[1]) {
            const basicParts = Buffer.from(authParts[1], 'base64').toString().split(':');
            if (basicParts.length >= 1) {
                return basicParts[0];
            }
        }
    }

    return null;
}

function getClientIP(req) {
    return (
        req.headers['x-forwarded-for'] ||
        req.headers['x-real-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.ip
    );
}

function sanitizeOAuth2Headers(headers) {
    const sanitized = { ...headers };
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['set-cookie'];
    return sanitized;
}

function sanitizeOAuth2Body(body) {
    if (!body || typeof body !== 'object') {
        return body;
    }

    const sanitized = { ...body };
    delete sanitized.client_secret;
    delete sanitized.password;
    return sanitized;
}

module.exports = router;