const express = require('express');
const router = express.Router();

const channelRoutes = require('./channels');
const tokenRoutes = require('./tokens');
const userRoutes = require('./users');
const modelRoutes = require('./models');
const redisRoutes = require('./redis');
const jobRoutes = require('./jobs');
const logRoutes = require('./logs');
const systemRoutes = require('./system');
const { authenticate, requireAdmin } = require('../../middleware/authCheck');

// 全局鉴权拦截
router.use(authenticate);

// 混合权限模块 (控制器内部处理 RBAC)
router.use('/channels', channelRoutes);
router.use('/tokens', tokenRoutes);

// 仅限管理员访问的模块
router.use('/users', requireAdmin, userRoutes);
router.use('/models', requireAdmin, modelRoutes);
router.use('/redis', requireAdmin, redisRoutes);
router.use('/jobs', requireAdmin, jobRoutes);
router.use('/system', requireAdmin, systemRoutes);

// 普通用户可访问 (但内容受限)
router.use('/logs', logRoutes);

module.exports = router;
