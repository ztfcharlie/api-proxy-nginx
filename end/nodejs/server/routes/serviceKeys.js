const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const LoggerService = require('../services/LoggerService');

// Determine the directory path
const getJsonDir = () => {
    // Resolve path to absolute to avoid security issues and ensure consistency
    const resolvePath = (p) => p ? path.resolve(p) : null;

    const possiblePaths = [
        process.env.JSON_DIR,
        '/app/json', // Docker
        path.join(process.cwd(), '../data/json'), // Local dev relative to nodejs root
        path.join(__dirname, '../../../data/json'),
        'D:\\www\\nginxzhuanfa\\end\\data\\json'
    ];
    
    for (const p of possiblePaths) {
        if (p && fs.existsSync(p)) {
            return resolvePath(p);
        }
    }
    // Fallback to creating the Docker one if nothing exists, or the local one
    return resolvePath(possiblePaths[1] || possiblePaths[2]); 
};

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = getJsonDir();
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// List files
router.get('/', (req, res) => {
    try {
        const dir = getJsonDir();
        if (!fs.existsSync(dir)) {
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
        LoggerService.error('List keys error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Upload file
router.post('/', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    try {
        const content = fs.readFileSync(req.file.path, 'utf8');
        JSON.parse(content); // Validate JSON
        LoggerService.info(`Uploaded key file: ${req.file.filename}`);
        res.json({ success: true, filename: req.file.filename });
    } catch (e) {
        fs.unlinkSync(req.file.path); // Delete invalid file
        res.status(400).json({ error: 'Invalid JSON file: ' + e.message });
    }
});

// Get file content
router.get('/:filename', (req, res) => {
    try {
        const dir = getJsonDir();
        const filepath = path.join(dir, req.params.filename);
        
        // Prevent directory traversal
        if (!filepath.startsWith(dir)) {
             return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const content = fs.readFileSync(filepath, 'utf8');
        res.json(JSON.parse(content));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rename file
router.put('/:filename', (req, res) => {
    try {
        const dir = getJsonDir();
        const oldPath = path.join(dir, req.params.filename);
        const newName = req.body.new_name;
        
        if (!newName || !newName.endsWith('.json')) {
             return res.status(400).json({ error: 'Invalid new filename (must end with .json)' });
        }
        
        const newPath = path.join(dir, newName);
        
        // Prevent directory traversal on new path
        if (!newPath.startsWith(dir)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (fs.existsSync(newPath)) {
            return res.status(400).json({ error: 'Target filename already exists' });
        }
        
        fs.renameSync(oldPath, newPath);
        LoggerService.info(`Renamed key file: ${req.params.filename} -> ${newName}`);
        res.json({ success: true, new_name: newName });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete file
router.delete('/:filename', (req, res) => {
    try {
        const dir = getJsonDir();
        const filepath = path.join(dir, req.params.filename);
        
        if (!filepath.startsWith(dir)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            LoggerService.info(`Deleted key file: ${req.params.filename}`);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
