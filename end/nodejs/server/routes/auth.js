const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const svgCaptcha = require('svg-captcha');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db').dbPool;
const RedisService = require('../services/RedisService');
const { authenticate } = require('../middleware/authCheck');

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

/**
 * 获取验证码
 */
router.get('/captcha', async (req, res) => {
    try {
        const captcha = svgCaptcha.create({
            size: 4,
            noise: 2,
            color: true,
            background: '#cc9966',
            width: 120,
            height: 40
        });

        const id = uuidv4();
        const redis = RedisService.getInstance();
        
        // 存入 Redis，5分钟过期
        // RedisService.set(key, value, ttl) 会自动处理 keyPrefix
        await redis.set(`captcha:${id}`, captcha.text.toLowerCase(), 300);

        res.json({
            id: id,
            image: captcha.data
        });
    } catch (err) {
        console.error('Captcha Error:', err);
        res.status(500).json({ error: 'Failed to generate captcha' });
    }
});

/**
 * 登录
 */
router.post('/login', async (req, res) => {
    const { username, password, captchaId, captchaCode } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    // 验证码校验
    if (!captchaId || !captchaCode) {
        return res.status(400).json({ error: 'Verification code is required' });
    }

    try {
        const redis = RedisService.getInstance();
        const redisKey = `captcha:${captchaId}`;
        const storedCode = await redis.get(redisKey);

        if (!storedCode) {
            return res.status(400).json({ error: 'Verification code expired', code: 'CAPTCHA_EXPIRED' });
        }

        if (storedCode !== captchaCode.toLowerCase()) {
            return res.status(400).json({ error: 'Invalid verification code', code: 'CAPTCHA_INVALID' });
        }

        // 验证成功后立即删除，防止重放
        await redis.delete(redisKey);

        const [users] = await db.query("SELECT * FROM sys_users WHERE username = ?", [username]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        if (user.status === 0) {
            return res.status(403).json({ error: 'Account disabled' });
        }

        // 验证密码
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 生成 Token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 获取当前用户信息
 */
router.get('/me', authenticate, async (req, res) => {
    res.json({ user: req.user });
});

/**
 * 修改密码
 */
router.post('/password', authenticate, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    try {
        const [users] = await db.query("SELECT * FROM sys_users WHERE id = ?", [req.user.id]);
        const user = users[0];

        const isValid = await bcrypt.compare(oldPassword, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Current password incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query("UPDATE sys_users SET password_hash = ? WHERE id = ?", [hashedPassword, req.user.id]);

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
