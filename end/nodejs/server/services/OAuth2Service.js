const jwt = require('jsonwebtoken');
const LoggerService = require('./LoggerService');
const DatabaseService = require('./DatabaseService');

class OAuth2Service {
    constructor() {
        this.databaseService = new DatabaseService();
        this.logger = LoggerService;
        this.jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production';
        this.tokenExpiration = parseInt(process.env.OAUTH2_ACCESS_TOKEN_EXPIRES) || 3600;
        this.refreshTokenExpiration = parseInt(process.env.OAUTH2_REFRESH_TOKEN_EXPIRES) || 86400;
    }

    async initialize() {
        try {
            await this.databaseService.initialize();
            this.logger.info('OAuth2Service initialized');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize OAuth2Service:', error);
            throw error;
        }
    }

    // 验证客户端凭证
    async authenticateClient(clientId, clientSecret) {
        try {
            // 从数据库查询客户端信息
            const clientQuery = `
                SELECT id, client_id, client_secret_hash, service_type,
                       enable, rate_limit, created_by, updated_by
                FROM clients
                WHERE client_id = ? AND enable = TRUE
            `;

            const clients = await this.databaseService.query(clientQuery, [clientId]);

            if (!clients || clients.length === 0) {
                this.logger.warn('Client not found or disabled:', { clientId });
                return { success: false, error: 'invalid_client', description: 'Client not found or disabled' };
            }

            const client = clients[0];

            // 验证客户端密钥（这里简化处理，实际应该使用密码哈希）
            if (client.client_secret_hash !== this.hashSecret(clientSecret)) {
                this.logger.warn('Invalid client secret:', { clientId });
                return { success: false, error: 'invalid_client', description: 'Invalid client credentials' };
            }

            // 检查速率限制
            if (client.rate_limit && client.rate_limit > 0) {
                const currentUsage = await this.getCurrentUsage(clientId);
                if (currentUsage >= client.rate_limit) {
                    this.logger.warn('Rate limit exceeded:', { clientId, currentUsage });
                    return { success: false, error: 'rate_limit_exceeded', description: 'Rate limit exceeded' };
                }
            }

            return { success: true, client };
        } catch (error) {
            this.logger.error('Error authenticating client:', error);
            return { success: false, error: 'server_error', description: 'Internal server error' };
        }
    }

    // 生成访问令牌
    async generateAccessToken(client, scopes = []) {
        try {
            const now = Math.floor(Date.now() / 1000);
            const expiresAt = now + this.tokenExpiration;

            const payload = {
                client_id: client.client_id,
                service_type: client.service_type,
                scopes,
                iat: now,
                exp: expiresAt,
                iss: process.env.OAUTH2_ISSUER || 'api-proxy-nodejs',
                aud: client.client_id,
                sub: client.id.toString()
            };

            const accessToken = jwt.sign(payload, this.jwtSecret, { algorithm: 'RS256' });

            // 生成刷新令牌
            const refreshToken = this.generateRefreshToken(client);

            // 存储令牌信息到数据库
            const tokenData = {
                client_id: client.id,
                access_token_hash: this.hashToken(accessToken),
                refresh_token_hash: this.hashToken(refreshToken),
                expires_at: new Date(expiresAt * 1000),
                scopes: JSON.stringify(scopes),
                created_at: new Date()
            };

            const insertQuery = `
                INSERT INTO oauth_tokens (
                    client_id, access_token_hash, refresh_token_hash,
                    expires_at, scopes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
            `;

            const insertResult = await this.databaseService.query(insertQuery, [
                client.id, tokenData.access_token_hash, tokenData.refresh_token_hash,
                tokenData.expires_at, tokenData.scopes, tokenData.created_at
            ]);

            // 记录令牌生成日志
            this.logger.info('Access token generated:', {
                client_id: client.id,
                token_id: insertResult.insertId,
                expires_at: tokenData.expires_at
            });

            return {
                success: true,
                access_token: accessToken,
                token_type: 'Bearer',
                expires_in: this.tokenExpiration,
                refresh_token: refreshToken,
                scope: scopes.join(' ')
            };
        } catch (error) {
            this.logger.error('Error generating access token:', error);
            return { success: false, error: 'server_error', description: 'Failed to generate access token' };
        }
    }

    // 生成刷新令牌
    generateRefreshToken(client) {
        const refreshTokenPayload = {
            client_id: client.client_id,
            token_type: 'refresh',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + this.refreshTokenExpiration
        };

        return jwt.sign(refreshTokenPayload, this.jwtSecret, { algorithm: 'RS256' });
    }

    // 使用刷新令牌获取新的访问令牌
    async refreshToken(refreshToken) {
        try {
            // 验证刷新令牌
            const decoded = jwt.verify(refreshToken, this.jwtSecret, { algorithms: ['RS256'] });

            if (decoded.token_type !== 'refresh') {
                return { success: false, error: 'invalid_grant', description: 'Invalid refresh token' };
            }

            // 从数据库查询客户端信息
            const clientQuery = `
                SELECT c.id, c.client_id, c.service_type, c.enable, c.rate_limit,
                       t.id as token_id, t.expires_at
                FROM clients c
                LEFT JOIN oauth_tokens t ON c.id = t.client_id
                WHERE c.client_id = ? AND c.enable = TRUE
                ORDER BY t.created_at DESC LIMIT 1
            `;

            const clients = await this.databaseService.query(clientQuery, [decoded.client_id]);

            if (!clients || clients.length === 0) {
                return { success: false, error: 'invalid_client', description: 'Client not found or disabled' };
            }

            const client = clients[0];

            // 撤销旧的刷新令牌
            if (client.token_id) {
                const revokeQuery = `UPDATE oauth_tokens SET revoked = TRUE WHERE id = ?`;
                await this.databaseService.query(revokeQuery, [client.token_id]);
            }

            // 生成新的访问令牌
            const scopes = []; // 从旧的令牌或默认作用域
            const result = await this.generateAccessToken(client, scopes);

            if (result.success) {
                this.logger.info('Token refreshed:', {
                    client_id: client.id,
                    new_token_id: result.token_id
                });
            }

            return result;
        } catch (error) {
            if (error.name === 'JsonWebTokenError') {
                return { success: false, error: 'invalid_grant', description: 'Invalid refresh token' };
            }

            this.logger.error('Error refreshing token:', error);
            return { success: false, error: 'server_error', description: 'Failed to refresh token' };
        }
    }

    // 验证访问令牌
    async verifyAccessToken(accessToken) {
        try {
            const decoded = jwt.verify(accessToken, this.jwtSecret, { algorithms: ['RS256'] });

            // 从数据库查询令牌信息
            const tokenQuery = `
                SELECT t.id, t.client_id, t.scopes, t.expires_at, t.revoked,
                       c.client_id as client_identifier, c.service_type, c.enable
                FROM oauth_tokens t
                JOIN clients c ON t.client_id = c.id
                WHERE t.access_token_hash = ? AND c.enable = TRUE
            `;

            const tokens = await this.databaseService.query(tokenQuery, [this.hashToken(accessToken)]);

            if (!tokens || tokens.length === 0) {
                return { success: false, error: 'invalid_token', description: 'Invalid access token' };
            }

            const token = tokens[0];

            // 检查令牌是否已撤销
            if (token.revoked) {
                return { success: false, error: 'invalid_token', description: 'Token has been revoked' };
            }

            // 检查令牌是否过期
            const now = new Date();
            if (now > token.expires_at) {
                return { success: false, error: 'invalid_token', description: 'Token has expired' };
            }

            return {
                success: true,
                client_id: token.client_id,
                client_identifier: token.client_identifier,
                service_type: token.service_type,
                scopes: JSON.parse(token.scopes || '[]')
            };
        } catch (error) {
            if (error.name === 'JsonWebTokenError') {
                return { success: false, error: 'invalid_token', description: 'Invalid access token' };
            }

            this.logger.error('Error verifying access token:', error);
            return { success: false, error: 'server_error', description: 'Failed to verify access token' };
        }
    }

    // 撤销令牌
    async revokeToken(token) {
        try {
            // 尝试作为访问令牌验证
            const accessResult = await this.verifyAccessToken(token);

            if (accessResult.success) {
                const revokeQuery = `
                    UPDATE oauth_tokens
                    SET revoked = TRUE, revoked_at = NOW()
                    WHERE client_id = ? AND access_token_hash = ?
                `;

                await this.databaseService.query(revokeQuery, [
                    accessResult.client_id,
                    this.hashToken(token)
                ]);

                this.logger.info('Access token revoked:', {
                    client_id: accessResult.client_id
                });

                return { success: true, message: 'Access token revoked successfully' };
            }

            // 尝试作为刷新令牌验证
            const decoded = jwt.verify(token, this.jwtSecret, { algorithms: ['RS256'] });

            if (decoded.token_type === 'refresh') {
                const revokeQuery = `
                    UPDATE oauth_tokens
                    SET revoked = TRUE, revoked_at = NOW()
                    WHERE client_id IN (
                        SELECT id FROM clients WHERE client_id = ?
                    )
                `;

                await this.databaseService.query(revokeQuery, [decoded.client_id]);

                this.logger.info('Refresh token revoked:', {
                    client_id: decoded.client_id
                });

                return { success: true, message: 'Refresh token revoked successfully' };
            }

            return { success: false, error: 'invalid_request', description: 'Invalid token' };
        } catch (error) {
            if (error.name === 'JsonWebTokenError') {
                return { success: false, error: 'invalid_request', description: 'Invalid token format' };
            }

            this.logger.error('Error revoking token:', error);
            return { success: false, error: 'server_error', description: 'Failed to revoke token' };
        }
    }

    // 获取令牌信息
    async getTokenInfo(accessToken) {
        try {
            const decoded = jwt.decode(accessToken);

            if (!decoded) {
                return { success: false, error: 'invalid_token', description: 'Invalid token format' };
            }

            // 从数据库查询令牌详情
            const tokenQuery = `
                SELECT t.id, t.client_id, t.scopes, t.expires_at, t.revoked, t.created_at,
                       c.client_id as client_identifier, c.service_type, c.enable
                FROM oauth_tokens t
                JOIN clients c ON t.client_id = c.id
                WHERE t.access_token_hash = ?
            `;

            const tokens = await this.databaseService.query(tokenQuery, [this.hashToken(accessToken)]);

            if (!tokens || tokens.length === 0) {
                return { success: false, error: 'invalid_token', description: 'Token not found' };
            }

            const token = tokens[0];

            return {
                success: true,
                client_id: token.client_id,
                client_identifier: token.client_identifier,
                service_type: token.service_type,
                scopes: JSON.parse(token.scopes || '[]'),
                expires_at: token.expires_at,
                created_at: token.created_at,
                revoked: token.revoked
            };
        } catch (error) {
            this.logger.error('Error getting token info:', error);
            return { success: false, error: 'server_error', description: 'Failed to get token info' };
        }
    }

    // 辅助方法：获取当前使用量
    async getCurrentUsage(clientId) {
        try {
            const usageQuery = `
                SELECT COUNT(*) as usage_count
                FROM oauth_tokens
                WHERE client_id = (SELECT id FROM clients WHERE client_id = ?)
                AND expires_at > NOW() AND revoked = FALSE
            `;

            const result = await this.databaseService.query(usageQuery, [clientId]);
            return result[0]?.usage_count || 0;
        } catch (error) {
            this.logger.error('Error getting current usage:', error);
            return 0;
        }
    }

    // 辅助方法：哈希密钥
    hashSecret(secret) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(secret).digest('hex');
    }

    // 辅助方法：哈希令牌
    hashToken(token) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    // 清理过期令牌
    async cleanupExpiredTokens() {
        try {
            const cleanupQuery = `
                DELETE FROM oauth_tokens
                WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
            `;

            const result = await this.databaseService.query(cleanupQuery);

            this.logger.info(`Cleaned up ${result.affectedRows} expired tokens`);
            return result.affectedRows;
        } catch (error) {
            this.logger.error('Error cleaning up expired tokens:', error);
            return 0;
        }
    }

    // 关闭数据库连接
    async close() {
        try {
            if (this.databaseService) {
                await this.databaseService.close();
            }
            this.logger.info('OAuth2Service closed');
        } catch (error) {
            this.logger.error('Error closing OAuth2Service:', error);
        }
    }
}

module.exports = OAuth2Service;