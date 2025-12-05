const mysql = require('mysql2/promise');
const Redis = require('ioredis');
require('dotenv').config();

// MySQL Pool
const dbPool = mysql.createPool({
    host: process.env.DB_HOST || 'mysql',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'ai_proxy',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Redis Client
const redis = new Redis({
    host: process.env.REDIS_HOST || 'api-proxy-redis',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
});

module.exports = { dbPool, redis };
