#!/usr/bin/env node

require('dotenv').config();

console.log('=== 简单环境变量测试 ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('REDIS_HOST:', process.env.REDIS_HOST);
console.log('REDIS_PORT:', process.env.REDIS_PORT);
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '***已设置***' : '未设置');
console.log('=== 测试完成 ===');