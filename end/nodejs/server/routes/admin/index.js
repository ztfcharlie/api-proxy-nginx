const express = require('express');
const router = express.Router();

const channelRoutes = require('./channels');
const tokenRoutes = require('./tokens');
const userRoutes = require('./users');

// 挂载子路由
router.use('/channels', channelRoutes);
router.use('/tokens', tokenRoutes);
router.use('/users', userRoutes);

module.exports = router;
