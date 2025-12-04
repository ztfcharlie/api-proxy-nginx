const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const LoggerService = require('../services/LoggerService');

// Path logic to find map-config.json
const getMapConfigPath = () => {
    const possiblePaths = [
        process.env.MAP_CONFIG_PATH, // Allow override
        path.join(process.cwd(), 'map/map-config.json'), // Docker environment (process.cwd() is usually /app)
        path.join(process.cwd(), '../data/map/map-config.json'), // Local dev if cwd is nodejs
        path.join(__dirname, '../../../data/map/map-config.json'), // Relative to this file (nodejs/server/routes -> root -> data/map)
        'D:\\www\\nginxzhuanfa\\end\\data\\map\\map-config.json' // Explicit absolute path as fallback/dev
    ];
    
    for (const p of possiblePaths) {
        if (p && fs.existsSync(p)) {
            return p;
        }
    }
    // Default for creation if not found
    return possiblePaths[1]; 
};

/**
 * @route GET /api/map-config
 * @desc Get the current map configuration
 */
router.get('/', (req, res) => {
    try {
        const configPath = getMapConfigPath();
        if (!fs.existsSync(configPath)) {
             // If file doesn't exist, return a default structure or empty
             return res.json({ 
                 clients: [], 
                 key_filename_gemini: [], 
                 key_filename_claude: [] 
             });
        }
        const content = fs.readFileSync(configPath, 'utf8');
        try {
            const json = JSON.parse(content);
            res.json(json);
        } catch (e) {
             LoggerService.error('Error parsing map config JSON:', e);
             res.status(500).json({ error: 'Invalid JSON in config file' });
        }
    } catch (error) {
        LoggerService.error('Error reading map config:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route POST /api/map-config
 * @desc Update the map configuration
 */
router.post('/', (req, res) => {
    try {
        const configPath = getMapConfigPath();
        const newConfig = req.body;
        
        if (!newConfig || typeof newConfig !== 'object') {
            return res.status(400).json({ error: 'Invalid configuration data' });
        }
        
        // Create directory if it doesn't exist
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write to file
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
        
        LoggerService.info(`Map config updated successfully at ${configPath}`);
        res.json({ success: true, message: 'Configuration saved' });
    } catch (error) {
        LoggerService.error('Error writing map config:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
