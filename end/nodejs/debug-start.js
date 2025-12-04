#!/usr/bin/env node

// 调试启动脚本 - 只加载环境变量，不启动数据库连接
require('dotenv').config();

console.log('=== 调试启动信息 ===');
console.log('当前工作目录:', process.cwd());
console.log('');

console.log('=== 环境变量检查 ===');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('REDIS_HOST:', process.env.REDIS_HOST);
console.log('REDIS_PORT:', process.env.REDIS_PORT);
console.log('');

console.log('=== 启动基础Express服务（不连接数据库） ===');

const express = require('express');
const app = express();

app.get('/test', (req, res) => {
  res.json({
    message: 'Debug server is running',
    env: {
      DB_HOST: process.env.DB_HOST,
      REDIS_HOST: process.env.REDIS_HOST,
      NODE_ENV: process.env.NODE_ENV
    }
  });
});

app.listen(8889, () => {
  console.log('Debug server running on http://localhost:8889');
  console.log('Visit http://localhost:8889/test to check environment variables');
});