const express = require('express');
const router = express.Router();
const db = require('../../config/db').dbPool;
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

/**
 * 更新用户
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { status, password, remark } = req.body;
    
    try {
        const updates = [];
        const params = [];
        
        if (status !== undefined) {
            updates.push("status = ?");
            params.push(status);
        }
        if (remark !== undefined) {
            updates.push("remark = ?");
            params.push(remark);
        }
        if (password) {
            // 这里暂时假设明文，如果要加密请用 bcrypt
            updates.push("password_hash = ?");
            params.push(password);
        }
        
        if (updates.length === 0) return res.json({ message: "No changes" });
        
        params.push(id);
        await db.query(`UPDATE sys_users SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ message: "User updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
