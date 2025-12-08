const express = require('express');
const router = express.Router();
const db = require('../../config/db').dbPool;
const logger = require('../../services/LoggerService');
const SyncManager = require('../../services/SyncManager');
const bcrypt = require('bcryptjs');

router.get('/', async (req, res) => {
    try {
        const [users] = await db.query("SELECT id, username, role, email, status, remark, created_at FROM sys_users ORDER BY id DESC");
        res.json({ data: users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    const { username, password, role, remark } = req.body;
    try {
        if (!password) {
            return res.status(400).json({ error: "Password is required" });
        }
        
        const hash = await bcrypt.hash(password, 10);
        const userRole = role || 'user';
        
        await db.query(
            "INSERT INTO sys_users (username, password_hash, role, remark) VALUES (?, ?, ?, ?)",
            [username, hash, userRole, remark]
        );
        res.status(201).json({ message: "User created" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { status, password, role, remark } = req.body;
    
    try {
        // [Security] Fetch user to check for 'admin' protection
        const [users] = await db.query("SELECT username FROM sys_users WHERE id = ?", [id]);
        if (users.length === 0) return res.status(404).json({ error: "User not found" });
        const targetUser = users[0];

        const updates = [];
        const params = [];
        
        if (targetUser.username === 'admin') {
            // Hardcode protection for super admin
            if (status !== undefined && parseInt(status) !== 1) {
                return res.status(403).json({ error: "Cannot disable the super admin account" });
            }
            if (role !== undefined && role !== 'admin') {
                return res.status(403).json({ error: "Cannot demote the super admin account" });
            }
        } else {
            // Normal users
            if (status !== undefined) {
                updates.push("status = ?");
                params.push(status);
            }
            if (role !== undefined) {
                updates.push("role = ?");
                params.push(role);
            }
        }

        if (remark !== undefined) {
            updates.push("remark = ?");
            params.push(remark);
        }
        
        if (password && password.trim() !== '') {
            const hash = await bcrypt.hash(password, 10);
            updates.push("password_hash = ?");
            params.push(hash);
        }
        
        if (updates.length === 0) return res.json({ message: "No changes" });
        
        params.push(id);
        await db.query(`UPDATE sys_users SET ${updates.join(', ')} WHERE id = ?`, params);
        
        // 如果更新了状态，需要刷新该用户下所有 Token 的缓存
        if (status !== undefined) {
            const [tokens] = await db.query("SELECT * FROM sys_virtual_tokens WHERE user_id = ?", [id]);
            for (const token of tokens) {
                await SyncManager.updateVirtualTokenCache(token);
            }
        }

        res.json({ message: "User updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 删除用户
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // [Security] Check if user is admin
        const [users] = await db.query("SELECT username FROM sys_users WHERE id = ?", [id]);
        if (users.length > 0 && users[0].username === 'admin') {
            return res.status(403).json({ error: "Cannot delete the super admin account" });
        }

        // 1. 检查是否有关联的 Tokens
        const [tokens] = await db.query("SELECT id FROM sys_virtual_tokens WHERE user_id = ?", [id]);
        if (tokens.length > 0) {
            return res.status(400).json({ error: "Cannot delete user: User has associated tokens. Please delete tokens first." });
        }

        // 2. 删除用户
        await db.query("DELETE FROM sys_users WHERE id = ?", [id]);
        res.json({ message: "User deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;