const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const LoggerService = require('./LoggerService');

class TokenService {
    constructor(databaseService, cacheService) {
        this.db = databaseService;
        this.cache = cacheService;
        this.logger = LoggerService;

        // 令牌配置
        this.accessTokenTTL = parseInt(process.env.CACHE_TTL_ACCESS_TOKEN) || 3600;
        this.refreshTokenTTL = parseInt(process.env.CACHE_TTL_REFRESH_TOKEN) || 86400;
        this.clientTokenTTL = parseInt(process.env.CACHE_TTL_CLIENT_TOKEN) || 1800;
        this.cleanupInterval = parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 300000;

        // JWT 配置
        this.jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production';
        this.jwtAlgorithm = process.env.JWT_ALGORITHM || 'RS256';
        this.issuer = process.env.OAUTH2_ISSUER || 'http://localhost:8889';
        this.audience = process.env.OAUTH2_AUDIENCE || 'api.yourdomain.com';

        // 启动清理定时器
        this.startCleanupTimer();
    }

    /**
     * 创建 client_token 到 Google access_token 的映射
     */
    async createTokenMapping(clientToken, serverAccountId, options = {}) {
        try {
            const startTime = Date.now();

            // 验证客户端是否有效
            const clientQuery = `
                SELECT id, client_token, enable, service_type
                FROM clients
                WHERE client_token = ? AND enable = TRUE
            `;

            const clients = await this.db.query(clientQuery, [clientToken]);
            if (!clients || clients.length === 0) {
                return {
                    success: false,
                    error: 'invalid_client',
                    description: 'Client token not found or disabled'
                };
            }

            const client = clients[0];

            // 验证服务账号是否有效
            const serverAccountQuery = `
                SELECT id, key_filename, project_id, client_email, client_id_google
                FROM server_accounts
                WHERE id = ? AND enable = TRUE
            `;

            const serverAccounts = await this.db.query(serverAccountQuery, [serverAccountId]);
            if (!serverAccounts || serverAccounts.length === 0) {
                return {
                    success: false,
                    error: 'invalid_server_account',
                    description: 'Server account not found or disabled'
                };
            }

            const serverAccount = serverAccounts[0];

            // 生成模拟的 Google access_token
            const googleAccessToken = await this.generateGoogleAccessToken(client, serverAccount);
            const googleRefreshToken = await this.generateGoogleRefreshToken(client, serverAccount);

            // 计算过期时间
            const now = new Date();
            const expiresAt = new Date(now.getTime() + (this.accessTokenTTL * 1000));
            const refreshTokenExpiresAt = new Date(now.getTime() + (this.refreshTokenTTL * 1000));

            // 存储映射关系到数据库
            const mappingData = {
                client_token: clientToken,
                server_account_id: serverAccountId,
                google_access_token: googleAccessToken,
                google_refresh_token: googleRefreshToken,
                token_type: 'Bearer',
                expires_at: expiresAt,
                scope: options.scopes || 'https://www.googleapis.com/auth/cloud-platform',
                cache_version: 1,
                status: 'active',
                request_ip: options.requestIp,
                user_agent: options.userAgent,
                grant_type: options.grantType || 'jwt_bearer'
            };

            const insertQuery = `
                INSERT INTO token_mappings (
                    client_token, server_account_id, google_access_token, google_refresh_token,
                    token_type, expires_at, scope, cache_version, status,
                    request_ip, user_agent, grant_type, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `;

            const insertResult = await this.db.query(insertQuery, [
                mappingData.client_token, mappingData.server_account_id,
                mappingData.google_access_token, mappingData.google_refresh_token,
                mappingData.token_type, mappingData.expires_at, mappingData.scope,
                mappingData.cache_version, mappingData.status, mappingData.request_ip,
                mappingData.user_agent, mappingData.grant_type
            ]);

            const mappingId = insertResult.insertId;

            // 缓存映射关系
            const cacheData = {
                mapping_id: mappingId,
                client_token: clientToken,
                client_id: client.id,
                service_type: client.service_type,
                server_account_id: serverAccountId,
                project_id: serverAccount.project_id,
                client_email: serverAccount.client_email,
                expires_at: expiresAt,
                scope: mappingData.scope,
                cache_version: 1
            };

            const cacheKey = this.getCacheKey(googleAccessToken);
            await this.cache.set(cacheKey, cacheData, this.accessTokenTTL);

            // 同时缓存 client_token 到 mapping_id 的关系（用于快速查找）
            const clientCacheKey = `client:${clientToken}:current`;
            await this.cache.set(clientCacheKey, cacheData, this.accessTokenTTL);

            const duration = Date.now() - startTime;
            this.logger.performance('createTokenMapping', duration, {
                client_id: client.id,
                server_account_id: serverAccountId,
                mapping_id: mappingId
            });

            // 记录令牌创建日志
            this.logger.tokenOperation('CREATE', 'access_token', clientToken, {
                mapping_id: mappingId,
                expires_at: expiresAt,
                server_account_id: serverAccountId
            });

            return {
                success: true,
                access_token: googleAccessToken,
                refresh_token: googleRefreshToken,
                token_type: mappingData.token_type,
                expires_in: this.accessTokenTTL,
                scope: mappingData.scope,
                mapping_id: mappingId
            };
        } catch (error) {
            this.logger.error('Error creating token mapping:', error);
            return {
                success: false,
                error: 'server_error',
                description: 'Failed to create token mapping'
            };
        }
    }

    /**
     * 根据Google access_token 获取 client_token
     */
    async getClientTokenByGoogleToken(googleAccessToken) {
        try {
            const startTime = Date.now();
            const cacheKey = this.getCacheKey(googleAccessToken);

            // 首先从缓存查找
            let cachedData = await this.cache.get(cacheKey);
            if (cachedData) {
                // 检查是否过期
                if (new Date(cachedData.expires_at) > new Date()) {
                    // 更新使用时间和次数
                    await this.updateTokenUsage(cachedData.mapping_id);

                    this.logger.cache('get', cacheKey, true, Date.now() - startTime);
                    return {
                        success: true,
                        client_token: cachedData.client_token,
                        client_id: cachedData.client_id,
                        service_type: cachedData.service_type,
                        server_account_id: cachedData.server_account_id,
                        project_id: cachedData.project_id,
                        expires_at: cachedData.expires_at
                    };
                } else {
                    // 缓存中的令牌已过期，删除缓存
                    await this.cache.delete(cacheKey);
                    await this.markTokenAsExpired(cachedData.mapping_id);
                }
            }

            // 缓存未命中，从数据库查询
            const query = `
                SELECT tm.id as mapping_id, tm.client_token, tm.expires_at, tm.scope,
                       tm.cache_version, tm.status, tm.last_used_at, tm.usage_count,
                       c.id as client_id, c.service_type,
                       sa.id as server_account_id, sa.project_id, sa.client_email
                FROM token_mappings tm
                JOIN clients c ON tm.client_token = c.client_token
                JOIN server_accounts sa ON tm.server_account_id = sa.id
                WHERE tm.google_access_token = ? AND tm.status = 'active'
            `;

            const mappings = await this.db.query(query, [googleAccessToken]);
            if (!mappings || mappings.length === 0) {
                this.logger.cache('get', cacheKey, false, Date.now() - startTime);
                return {
                    success: false,
                    error: 'invalid_token',
                    description: 'Token not found or inactive'
                };
            }

            const mapping = mappings[0];

            // 检查令牌是否过期
            if (new Date(mapping.expires_at) < new Date()) {
                await this.markTokenAsExpired(mapping.mapping_id);
                return {
                    success: false,
                    error: 'token_expired',
                    description: 'Access token has expired'
                };
            }

            // 更新使用时间和次数
            await this.updateTokenUsage(mapping.mapping_id);

            // 缓存结果
            const cacheData = {
                mapping_id: mapping.mapping_id,
                client_token: mapping.client_token,
                client_id: mapping.client_id,
                service_type: mapping.service_type,
                server_account_id: mapping.server_account_id,
                project_id: mapping.project_id,
                client_email: mapping.client_email,
                expires_at: mapping.expires_at,
                scope: mapping.scope,
                cache_version: mapping.cache_version
            };

            const ttl = Math.max(1, Math.floor((new Date(mapping.expires_at) - new Date()) / 1000));
            await this.cache.set(cacheKey, cacheData, ttl);

            this.logger.cache('get', cacheKey, false, Date.now() - startTime);

            return {
                success: true,
                client_token: mapping.client_token,
                client_id: mapping.client_id,
                service_type: mapping.service_type,
                server_account_id: mapping.server_account_id,
                project_id: mapping.project_id,
                expires_at: mapping.expires_at
            };
        } catch (error) {
            this.logger.error('Error getting client token by Google token:', error);
            return {
                success: false,
                error: 'server_error',
                description: 'Failed to retrieve client token'
            };
        }
    }

    /**
     * 刷新访问令牌
     */
    async refreshTokenMapping(refreshToken, options = {}) {
        try {
            // 从数据库查找刷新令牌
            const query = `
                SELECT tm.id as mapping_id, tm.client_token, tm.server_account_id,
                       tm.cache_version, tm.status, tm.expires_at,
                       c.id as client_id, c.service_type,
                       sa.project_id, sa.client_email, sa.client_id_google
                FROM token_mappings tm
                JOIN clients c ON tm.client_token = c.client_token
                JOIN server_accounts sa ON tm.server_account_id = sa.id
                WHERE tm.google_refresh_token = ? AND tm.status = 'active'
            `;

            const mappings = await this.db.query(query, [refreshToken]);
            if (!mappings || mappings.length === 0) {
                return {
                    success: false,
                    error: 'invalid_grant',
                    description: 'Refresh token not found or invalid'
                };
            }

            const mapping = mappings[0];

            // 检查刷新令牌是否过期
            const refreshExpiresAt = new Date(mapping.expires_at.getTime() + (this.refreshTokenTTL * 1000));
            if (new Date() > refreshExpiresAt) {
                await this.revokeTokenMapping(mapping.mapping_id, 'refresh_expired');
                return {
                    success: false,
                    error: 'invalid_grant',
                    description: 'Refresh token has expired'
                };
            }

            // 生成新的访问令牌
            const serverAccount = {
                id: mapping.server_account_id,
                project_id: mapping.project_id,
                client_email: mapping.client_email,
                client_id_google: mapping.client_id_google
            };

            const client = {
                id: mapping.client_id,
                client_token: mapping.client_token,
                service_type: mapping.service_type
            };

            const newGoogleAccessToken = await this.generateGoogleAccessToken(client, serverAccount);
            const newGoogleRefreshToken = await this.generateGoogleRefreshToken(client, serverAccount);

            // 更新数据库记录
            const now = new Date();
            const newExpiresAt = new Date(now.getTime() + (this.accessTokenTTL * 1000));

            const updateQuery = `
                UPDATE token_mappings
                SET google_access_token = ?, google_refresh_token = ?,
                    expires_at = ?, cache_version = cache_version + 1,
                    updated_at = NOW()
                WHERE id = ?
            `;

            await this.db.query(updateQuery, [
                newGoogleAccessToken, newGoogleRefreshToken,
                newExpiresAt, mapping.mapping_id
            ]);

            // 清除旧缓存
            const oldCacheKey = this.getCacheKey(mapping.google_access_token);
            await this.cache.delete(oldCacheKey);

            // 缓存新映射关系
            const cacheData = {
                mapping_id: mapping.mapping_id,
                client_token: mapping.client_token,
                client_id: mapping.client_id,
                service_type: mapping.service_type,
                server_account_id: mapping.server_account_id,
                project_id: mapping.project_id,
                expires_at: newExpiresAt,
                cache_version: mapping.cache_version + 1
            };

            const newCacheKey = this.getCacheKey(newGoogleAccessToken);
            await this.cache.set(newCacheKey, cacheData, this.accessTokenTTL);

            // 记录令牌刷新日志
            this.logger.tokenOperation('REFRESH', 'access_token', mapping.client_token, {
                mapping_id: mapping.mapping_id,
                new_expires_at: newExpiresAt
            });

            return {
                success: true,
                access_token: newGoogleAccessToken,
                refresh_token: newGoogleRefreshToken,
                token_type: 'Bearer',
                expires_in: this.accessTokenTTL
            };
        } catch (error) {
            this.logger.error('Error refreshing token mapping:', error);
            return {
                success: false,
                error: 'server_error',
                description: 'Failed to refresh access token'
            };
        }
    }

    /**
     * 撤销令牌映射
     */
    async revokeTokenMapping(googleAccessToken, reason = 'user_request') {
        try {
            const query = `
                UPDATE token_mappings
                SET status = 'revoked', revoked_at = NOW(), cache_version = cache_version + 1,
                    revoke_reason = ?, updated_at = NOW()
                WHERE google_access_token = ? AND status = 'active'
            `;

            const result = await this.db.query(query, [reason, googleAccessToken]);

            if (result.affectedRows > 0) {
                // 删除缓存
                const cacheKey = this.getCacheKey(googleAccessToken);
                await this.cache.delete(cacheKey);

                // 记录撤销日志
                this.logger.tokenOperation('REVOKE', 'access_token', 'unknown', {
                    google_access_token: this.maskToken(googleAccessToken),
                    reason: reason
                });

                return { success: true, message: 'Token revoked successfully' };
            } else {
                return {
                    success: false,
                    error: 'invalid_token',
                    description: 'Token not found or already revoked'
                };
            }
        } catch (error) {
            this.logger.error('Error revoking token mapping:', error);
            return {
                success: false,
                error: 'server_error',
                description: 'Failed to revoke token'
            };
        }
    }

    /**
     * 生成模拟的 Google access_token
     */
    async generateGoogleAccessToken(client, serverAccount) {
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + this.accessTokenTTL;

        const payload = {
            azp: serverAccount.client_id_google,
            aud: this.audience,
            scope: 'https://www.googleapis.com/auth/cloud-platform',
            exp: expiresAt,
            access_type: 'offline',
            iss: serverAccount.client_email,
            sub: serverAccount.client_email,
            iat: now,
            email: serverAccount.client_email,
            email_verified: true,
            client_id: serverAccount.client_id_google,
            token_use: 'access'
        };

        // 使用 Google 私钥签名（这里简化处理，实际应该使用真实的私钥）
        const signature = this.generateGoogleSignature(payload);

        // 模拟 Google access_token 格式
        return `ya29.a0AfH6SMC${Buffer.from(JSON.stringify(payload)).toString('base64').slice(0, 20)}${signature.slice(0, 12)}`;
    }

    /**
     * 生成模拟的 Google refresh_token
     */
    async generateGoogleRefreshToken(client, serverAccount) {
        const payload = {
            client_id: serverAccount.client_id_google,
            client_secret: 'mock_client_secret',
            grant_type: 'refresh_token',
            refresh_token: true
        };

        return `1//${Buffer.from(JSON.stringify(payload)).toString('base64').slice(0, 30)}${Date.now().toString(36)}`;
    }

    /**
     * 生成 Google 签名（模拟）
     */
    generateGoogleSignature(payload) {
        const data = JSON.stringify(payload);
        return crypto.createHash('sha256').update(data + Date.now()).digest('hex');
    }

    /**
     * 获取缓存键
     */
    getCacheKey(googleAccessToken) {
        return `oauth2:access_token:${crypto.createHash('md5').update(googleAccessToken).digest('hex')}`;
    }

    /**
     * 更新令牌使用信息
     */
    async updateTokenUsage(mappingId) {
        try {
            const query = `
                UPDATE token_mappings
                SET last_used_at = NOW(), usage_count = usage_count + 1
                WHERE id = ?
            `;

            await this.db.query(query, [mappingId]);
        } catch (error) {
            this.logger.error('Error updating token usage:', error);
        }
    }

    /**
     * 标记令牌为已过期
     */
    async markTokenAsExpired(mappingId) {
        try {
            const query = `
                UPDATE token_mappings
                SET status = 'expired', cache_version = cache_version + 1, updated_at = NOW()
                WHERE id = ?
            `;

            await this.db.query(query, [mappingId]);
        } catch (error) {
            this.logger.error('Error marking token as expired:', error);
        }
    }

    /**
     * 启动清理定时器
     */
    startCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(async () => {
            await this.cleanupExpiredTokens();
        }, this.cleanupInterval);

        this.logger.info('Token cleanup timer started', {
            interval: this.cleanupInterval
        });
    }

    /**
     * 清理过期令牌
     */
    async cleanupExpiredTokens() {
        try {
            const query = `
                UPDATE token_mappings
                SET status = 'expired', cache_version = cache_version + 1, updated_at = NOW()
                WHERE expires_at < NOW() AND status = 'active'
            `;

            const result = await this.db.query(query);
            const count = result.affectedRows;

            if (count > 0) {
                this.logger.info(`Cleaned up ${count} expired tokens`, { count });

                // 清理相关的缓存项（批量删除）
                const expiredTokensQuery = `
                    SELECT google_access_token FROM token_mappings
                    WHERE status = 'expired' AND updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
                `;

                const expiredTokens = await this.db.query(expiredTokensQuery);
                for (const token of expiredTokens) {
                    const cacheKey = this.getCacheKey(token.google_access_token);
                    await this.cache.delete(cacheKey);
                }
            }
        } catch (error) {
            this.logger.error('Error cleaning up expired tokens:', error);
        }
    }

    /**
     * 掩码令牌
     */
    maskToken(token) {
        if (!token || typeof token !== 'string') {
            return '****';
        }

        if (token.length > 10) {
            return `${token.substring(0, 6)}****${token.substring(token.length - 4)}`;
        }

        return '****';
    }

    /**
     * 获取令牌统计信息
     */
    async getTokenStats(clientToken = null) {
        try {
            let whereClause = '1=1';
            let params = [];

            if (clientToken) {
                whereClause += ' AND client_token = ?';
                params.push(clientToken);
            }

            const query = `
                SELECT
                    COUNT(*) as total_tokens,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_tokens,
                    COUNT(CASE WHEN status = 'revoked' THEN 1 END) as revoked_tokens,
                    COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_tokens,
                    AVG(usage_count) as avg_usage,
                    MAX(usage_count) as max_usage,
                    MAX(last_used_at) as last_activity
                FROM token_mappings
                WHERE ${whereClause}
            `;

            const result = await this.db.query(query, params);
            return result[0];
        } catch (error) {
            this.logger.error('Error getting token stats:', error);
            return null;
        }
    }

    /**
     * 关闭服务
     */
    async close() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        this.logger.info('TokenService closed');
    }
}

module.exports = TokenService;