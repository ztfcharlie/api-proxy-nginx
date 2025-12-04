const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const LoggerService = require('../services/LoggerService');

// Determine the directory path for JWTs
const getJwtDir = () => {
    const resolvePath = (p) => p ? path.resolve(p) : null;

    const possiblePaths = [
        process.env.JWT_DIR,
        '/app/jwt', // Docker
        path.join(process.cwd(), '../data/jwt'), // Local dev relative to nodejs root
        path.join(__dirname, '../../../data/jwt'),
        'D:\\www\\nginxzhuanfa\\end\\data\\jwt'
    ];
    
    for (const p of possiblePaths) {
        if (p && fs.existsSync(p)) {
            return resolvePath(p);
        }
    }
    // Fallback
    return resolvePath(possiblePaths[1] || possiblePaths[2]); 
};

// List files
router.get('/', (req, res) => {
    try {
        const dir = getJwtDir();
        if (!fs.existsSync(dir)) {
            // Try to create it if it doesn't exist (though usually it should exist)
            try {
                fs.mkdirSync(dir, { recursive: true });
            } catch (e) {
                return res.json([]);
            }
            return res.json([]);
        }
        
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        
        const fileList = files.map(f => {
            const stat = fs.statSync(path.join(dir, f));
            return {
                name: f,
                size: stat.size,
                updated_at: stat.mtime
            };
        });
        
        res.json(fileList);
    } catch (error) {
        LoggerService.error('List JWT files error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get file content
router.get('/:filename', (req, res) => {
    try {
        const dir = getJwtDir();
        const filepath = path.join(dir, req.params.filename);
        
        // Prevent directory traversal
        if (!filepath.startsWith(dir)) {
             return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const content = fs.readFileSync(filepath, 'utf8');
        // Try to parse JSON, if fails return as string (though they should be JSON)
        try {
            res.json(JSON.parse(content));
        } catch (e) {
            res.json({ content: content, raw: true });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete file
router.delete('/:filename', (req, res) => {
    try {
        const dir = getJwtDir();
        const filepath = path.join(dir, req.params.filename);
        
        if (!filepath.startsWith(dir)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            LoggerService.info(`Deleted JWT file: ${req.params.filename}`);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
