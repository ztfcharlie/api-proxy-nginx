const express = require('express');
const fs = require('fs');
const path = require('path');
const LoggerService = require('../services/LoggerService');

const router = express.Router();
const logger = LoggerService;

// 获取配置文件路径的辅助函数
function getMapConfigPath() {
    // 尝试查找配置文件的多个可能位置
    // 1. Docker 环境: /app/map/map-config.json (process.cwd() is /app)
    // 2. 本地开发环境: ../data/map/map-config.json (relative to nodejs folder)
    const possiblePaths = [
        path.join(process.cwd(), 'map/map-config.json'),
        path.join(process.cwd(), '../data/map/map-config.json')
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return null;
}

/**
 * 获取 Map 配置
 */
router.get('/map', (req, res) => {
    try {
        const configPath = getMapConfigPath();
        if (!configPath) {
            return res.status(404).json({
                success: false,
                error: { message: 'Configuration file not found' }
            });
        }

        const content = fs.readFileSync(configPath, 'utf8');
        const json = JSON.parse(content);
        
        res.json({
            success: true,
            data: json,
            path: configPath // 仅用于调试，生产环境可移除
        });
    } catch (error) {
        logger.error('Failed to read map config:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to read configuration: ' + error.message }
        });
    }
});

/**
 * 更新 Map 配置
 */
router.put('/map', (req, res) => {
    try {
        const configPath = getMapConfigPath();
        if (!configPath) {
            return res.status(404).json({
                success: false,
                error: { message: 'Configuration file not found' }
            });
        }

        const newConfig = req.body;
        
        // 基本验证
        if (!newConfig || typeof newConfig !== 'object') {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid JSON data' }
            });
        }

        // 写入文件
        // 使用 JSON.stringify 格式化输出，缩进2个空格
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
        
        logger.info('Map config updated via API');
        
        res.json({
            success: true,
            message: 'Configuration saved successfully'
        });
    } catch (error) {
        logger.error('Failed to save map config:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to save configuration: ' + error.message }
        });
    }
});

module.exports = router;