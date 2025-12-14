const jwt = require('jsonwebtoken');
const logger = require('../services/LoggerService');

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

// 验证 Token 并获取用户信息
const authenticate = (req, res, next) => {
    let token = '';
    const authHeader = req.headers.authorization;

    if (authHeader) {
        token = authHeader.split(' ')[1]; // Bearer <token>
    } else if (req.query.token) {
        token = req.query.token; // ?token=<token>
    }

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    try {
        const user = jwt.verify(token, JWT_SECRET);
        req.user = user; // { id, username, role }

        // [Sliding Expiration] Automatically renew token if close to expiry
        const now = Math.floor(Date.now() / 1000);
        if (user.exp) {
            const timeLeft = user.exp - now;
            // If less than 3 days left (assuming 7d life), issue a new one
            const RENEW_THRESHOLD = 3 * 24 * 3600; 
            
            if (timeLeft < RENEW_THRESHOLD) {
                const newToken = jwt.sign(
                    { id: user.id, username: user.username, role: user.role },
                    JWT_SECRET,
                    { expiresIn: '7d' }
                );
                res.setHeader('X-New-Token', newToken);
                res.setHeader('Access-Control-Expose-Headers', 'X-New-Token');
            }
        }

        next();
    } catch (err) {
        logger.warn(`[Auth] Invalid token: ${err.message}`);
        return res.status(403).json({ error: 'Forbidden: Invalid token' });
    }
};

// 仅限管理员
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    next();
};

module.exports = { authenticate, requireAdmin };
