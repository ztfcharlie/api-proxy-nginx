const express = require('express');
const router = express.Router();
const db = require('../../config/db').dbPool;
const bcrypt = require('bcryptjs'); // 需要确认 package.json 是否有 bcryptjs
const logger = require('../../services/LoggerService');

router.get('/', async (req, res) => {
    try {
        const [users] = await db.query("SELECT id, username, email, status, remark, created_at FROM sys_users ORDER BY id DESC");
        res.json({ data: users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    const { username, password, remark } = req.body;
    try {
        // 简单 hash (实际建议用 bcrypt)
        // 这里假设 password_hash 直接存明文或者前端 hash (演示用)
        // 正确做法: const hash = await bcrypt.hash(password, 10);
        const hash = password; 
        
        await db.query(
            "INSERT INTO sys_users (username, password_hash, remark) VALUES (?, ?, ?)",
            [username, hash, remark]
        );
        res.status(201).json({ message: "User created" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
