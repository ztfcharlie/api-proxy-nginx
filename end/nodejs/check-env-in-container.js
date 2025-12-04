#!/usr/bin/env node

// 在容器中检查环境变量是否正确加载
console.log('=== 容器内环境变量检查 ===');
console.log('当前工作目录:', process.cwd());
console.log('');

// 检查.env文件是否存在
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env');
console.log('.env文件路径:', envPath);
console.log('.env文件是否存在:', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
    console.log('.env文件大小:', fs.statSync(envPath).size, 'bytes');
    console.log('.env文件内容前100字符:');
    console.log(fs.readFileSync(envPath, 'utf8').substring(0, 100));
    console.log('');
}

// 检查关键环境变量
console.log('=== 关键环境变量 ===');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('REDIS_HOST:', process.env.REDIS_HOST);
console.log('REDIS_PORT:', process.env.REDIS_PORT);
console.log('');

// 手动加载dotenv测试
try {
    require('dotenv').config();
    console.log('=== 手动加载dotenv后 ===');
    console.log('DB_HOST:', process.env.DB_HOST);
    console.log('DB_PORT:', process.env.DB_PORT);
    console.log('REDIS_HOST:', process.env.REDIS_HOST);
    console.log('REDIS_PORT:', process.env.REDIS_PORT);
} catch (error) {
    console.log('dotenv加载失败:', error.message);
}