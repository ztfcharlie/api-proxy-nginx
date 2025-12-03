const mysql = require('mysql2/promise');
const LoggerService = require('./LoggerService');

class DatabaseService {
    constructor() {
        this.pool = null;
        this.config = {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'oauth2_mock',
            charset: process.env.DB_CHARSET || 'utf8mb4',
            timezone: process.env.DB_TIMEZONE || '+08:00',
            connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
            queueLimit: 0,
            // SSL configuration - disable SSL verification for all environments
            ssl: false // Force disable SSL for both development and production
        };
    }

    async initialize() {
        try {
            this.pool = mysql.createPool(this.config);

            // 测试连接
            const connection = await this.pool.getConnection();
            await connection.ping();
            connection.release();

            LoggerService.info('Database connection established', {
                host: this.config.host,
                port: this.config.port,
                database: this.config.database
            });

            // 监听连接池事件
            this.pool.on('connection', (connection) => {
                LoggerService.debug('New database connection created', {
                    connectionId: connection.threadId
                });
            });

            this.pool.on('error', (err) => {
                LoggerService.error('Database connection pool error:', err);
            });

            return true;
        } catch (error) {
            LoggerService.error('Failed to initialize database connection:', error);
            throw error;
        }
    }

    async close() {
        try {
            if (this.pool) {
                await this.pool.end();
                LoggerService.info('Database connection pool closed');
            }
        } catch (error) {
            LoggerService.error('Error closing database connection:', error);
            throw error;
        }
    }

    async query(sql, params = [], options = {}) {
        const startTime = Date.now();
        let connection = null;

        try {
            connection = await this.pool.getConnection();

            const queryTime = Date.now();
            const [results] = await connection.query(sql, params, options);
            const queryDuration = Date.now() - queryTime;

            LoggerService.debug('Database query executed', {
                sql: sql.replace(/\s+/g, ' ').trim(),
                params,
                rowCount: Array.isArray(results) ? results.length : 1,
                duration: `${queryDuration}ms`
            });

            return results;
        } catch (error) {
            const queryDuration = Date.now() - startTime;
            LoggerService.error('Database query failed:', {
                error: error.message,
                sql: sql.replace(/\s+/g, ' ').trim(),
                params,
                duration: `${queryDuration}ms`,
                code: error.code,
                errno: error.errno
            });
            throw error;
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    async transaction(queries) {
        const connection = await this.pool.getConnection();
        const startTime = Date.now();

        try {
            await connection.beginTransaction();

            const results = [];
            for (const query of queries) {
                const [result] = await connection.query(query.sql, query.params);
                results.push(result);
            }

            await connection.commit();

            LoggerService.debug('Database transaction completed', {
                queryCount: queries.length,
                duration: `${Date.now() - startTime}ms`
            });

            return results;
        } catch (error) {
            await connection.rollback();
            LoggerService.error('Database transaction failed:', {
                error: error.message,
                queryCount: queries.length,
                duration: `${Date.now() - startTime}ms`
            });
            throw error;
        } finally {
            connection.release();
        }
    }

    async insert(table, data, options = {}) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map(() => '?').join(', ');

        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;

        try {
            const result = await this.query(sql, values, options);
            return result.insertId;
        } catch (error) {
            LoggerService.error('Database insert failed:', {
                table,
                data,
                error: error.message
            });
            throw error;
        }
    }

    async update(table, data, where, options = {}) {
        const setClause = Object.keys(data)
            .map(key => `${key} = ?`)
            .join(', ');
        const values = [...Object.values(data), ...Object.values(where)];

        const whereClause = Object.keys(where)
            .map(key => `${key} = ?`)
            .join(' AND ');

        const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;

        try {
            const result = await this.query(sql, values, options);
            return result.affectedRows;
        } catch (error) {
            LoggerService.error('Database update failed:', {
                table,
                data,
                where,
                error: error.message
            });
            throw error;
        }
    }

    async delete(table, where, options = {}) {
        const whereClause = Object.keys(where)
            .map(key => `${key} = ?`)
            .join(' AND ');
        const values = Object.values(where);

        const sql = `DELETE FROM ${table} WHERE ${whereClause}`;

        try {
            const result = await this.query(sql, values, options);
            return result.affectedRows;
        } catch (error) {
            LoggerService.error('Database delete failed:', {
                table,
                where,
                error: error.message
            });
            throw error;
        }
    }

    async select(table, where = {}, options = {}) {
        const whereClause = Object.keys(where)
            .map(key => `${key} = ?`)
            .join(' AND ');
        const values = Object.values(where);

        let sql = `SELECT * FROM ${table}`;
        if (Object.keys(where).length > 0) {
            sql += ` WHERE ${whereClause}`;
        }

        if (options.orderBy) {
            sql += ` ORDER BY ${options.orderBy}`;
        }

        if (options.limit) {
            sql += ` LIMIT ?`;
            values.push(options.limit);
        }

        if (options.offset) {
            sql += ` OFFSET ?`;
            values.push(options.offset);
        }

        try {
            const results = await this.query(sql, values, options);
            return results;
        } catch (error) {
            LoggerService.error('Database select failed:', {
                table,
                where,
                options,
                error: error.message
            });
            throw error;
        }
    }

    async findOne(table, where, options = {}) {
        const results = await this.select(table, where, { ...options, limit: 1 });
        return results.length > 0 ? results[0] : null;
    }

    async exists(table, where) {
        const result = await this.query(
            `SELECT COUNT(*) as count FROM ${table} WHERE ${Object.keys(where).map(key => `${key} = ?`).join(' AND ')}`,
            Object.values(where)
        );
        return result[0].count > 0;
    }

    async count(table, where = {}) {
        const whereClause = Object.keys(where)
            .map(key => `${key} = ?`)
            .join(' AND ');
        const values = Object.values(where);

        let sql = `SELECT COUNT(*) as count FROM ${table}`;
        if (Object.keys(where).length > 0) {
            sql += ` WHERE ${whereClause}`;
        }

        const result = await this.query(sql, values);
        return result[0].count;
    }

    async getConnectionInfo() {
        try {
            const connection = await this.pool.getConnection();
            const [rows] = await connection.query('SELECT CONNECTION_ID() as id, NOW() as current_time');
            connection.release();

            return {
                id: rows[0].id,
                currentTime: rows[0].current_time,
                poolSize: this.pool._allConnections.length,
                freeConnections: this.pool._freeConnections.length,
                connectionLimit: this.config.connectionLimit
            };
        } catch (error) {
            LoggerService.error('Failed to get connection info:', error);
            return null;
        }
    }

    async healthCheck() {
        try {
            const startTime = Date.now();
            const result = await this.query('SELECT 1 as health_check');
            const responseTime = Date.now() - startTime;

            return {
                status: 'healthy',
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString(),
                connectionInfo: await this.getConnectionInfo()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = DatabaseService;