#!/usr/bin/env node

// 环境变量调试脚本
require('dotenv').config();

console.log('=== 环境变量调试信息 ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('LOG_LEVEL:', process.env.LOG_LEVEL);
console.log('');
console.log('=== 数据库配置 ===');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_CHARSET:', process.env.DB_CHARSET);
console.log('');
console.log('=== Redis 配置 ===');
console.log('REDIS_HOST:', process.env.REDIS_HOST);
console.log('REDIS_PORT:', process.env.REDIS_PORT);
console.log('REDIS_DB:', process.env.REDIS_DB);
console.log('REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? '***已设置***' : '未设置');
console.log('');
console.log('=== Docker 容器信息 ===');
console.log('容器名称:', process.env.HOSTNAME || '未知');
console.log('当前工作目录:', process.cwd());
console.log('');

// 测试网络连接
console.log('=== 网络连接测试 ===');
const net = require('net');

function testConnection(host, port, name) {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        const timeout = setTimeout(() => {
            socket.destroy();
            console.log(`${name} (${host}:${port}) - ❌ 连接超时`);
            resolve(false);
        }, 3000);

        socket.connect(port, host, () => {
            clearTimeout(timeout);
            socket.end();
            console.log(`${name} (${host}:${port}) - ✅ 连接成功`);
            resolve(true);
        });

        socket.on('error', () => {
            clearTimeout(timeout);
            console.log(`${name} (${host}:${port}) - ❌ 连接失败`);
            resolve(false);
        });
    });
}

async function testConnections() {
    console.log('正在测试网络连接...');

    await testConnection(process.env.DB_HOST, process.env.DB_PORT, 'MySQL');
    await testConnection(process.env.REDIS_HOST, process.env.REDIS_PORT, 'Redis');

    console.log('\n=== 测试完成 ===');
}

testConnections();