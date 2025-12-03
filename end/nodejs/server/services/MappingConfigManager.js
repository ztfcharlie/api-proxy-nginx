/**
 * 映射配置管理工具
 * 处理客户ID和渠道模型映射配置文件的管理
 */

const fs = require('fs').promises;
const path = require('path');
const Paths = require('../config/Paths');

class MappingConfigManager {
    constructor() {
        this.mapDir = Paths.getMapDir();
        this.configFile = 'map-config.json';
    }

    /**
     * 读取映射配置文件
     * @param {string} filename - 配置文件名（可选，默认为map-config.json）
     * @returns {Promise<Object>} 映射配置对象
     */
    async readMappingConfig(filename = null) {
        try {
            const configFilename = filename || this.configFile;
            const filePath = this.getMappingConfigPath(configFilename);
            const content = await fs.readFile(filePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            throw new Error(`读取映射配置文件失败: ${error.message}`);
        }
    }

    /**
     * 写入映射配置文件
     * @param {Object} data - 映射配置数据
     * @param {string} filename - 配置文件名（可选）
     * @returns {Promise<void>}
     */
    async writeMappingConfig(data, filename = null) {
        try {
            const configFilename = filename || this.configFile;
            const filePath = this.getMappingConfigPath(configFilename);
            const content = JSON.stringify(data, null, 2);
            await fs.writeFile(filePath, content, 'utf8');
        } catch (error) {
            throw new Error(`写入映射配置文件失败: ${error.message}`);
        }
    }

    /**
     * 获取映射配置文件的完整路径
     * @param {string} filename - 文件名
     * @returns {string} 完整路径
     */
    getMappingConfigPath(filename) {
        return Paths.getMapFile(filename);
    }

    /**
     * 验证映射配置格式
     * @param {Object} data - 映射配置数据
     * @returns {Object} 验证结果
     */
    validateMappingConfig(data) {
        const result = {
            valid: true,
            errors: []
        };

        if (!data || typeof data !== 'object') {
            result.valid = false;
            result.errors.push('配置必须是一个对象');
            return result;
        }

        // 验证mappings字段
        if (!data.mappings || typeof data.mappings !== 'object') {
            result.valid = false;
            result.errors.push('缺少mappings字段或格式不正确');
            return result;
        }

        // 验证每个映射项
        for (const [clientToken, mapping] of Object.entries(data.mappings)) {
            if (!this.validateMappingItem(mapping)) {
                result.valid = false;
                result.errors.push(`映射项 ${clientToken} 格式不正确`);
            }
        }

        return result;
    }

    /**
     * 验证单个映射项格式
     * @param {Object} mapping - 映射项
     * @returns {boolean} 是否有效
     */
    validateMappingItem(mapping) {
        if (!mapping || typeof mapping !== 'object') {
            return false;
        }

        // 检查必需字段
        const requiredFields = ['google_access_token', 'expires_at'];
        return requiredFields.every(field => mapping[field]);
    }

    /**
     * 根据客户端token获取映射配置
     * @param {string} clientToken - 客户端token
     * @param {string} filename - 配置文件名（可选）
     * @returns {Promise<Object|null>} 映射配置或null
     */
    async getMappingByClientToken(clientToken, filename = null) {
        try {
            const config = await this.readMappingConfig(filename);
            return config.mappings[clientToken] || null;
        } catch (error) {
            console.error('获取映射配置失败:', error);
            return null;
        }
    }

    /**
     * 添加或更新映射配置
     * @param {string} clientToken - 客户端token
     * @param {Object} mapping - 映射配置
     * @param {string} filename - 配置文件名（可选）
     * @returns {Promise<void>}
     */
    async updateMapping(clientToken, mapping, filename = null) {
        try {
            const configFilename = filename || this.configFile;

            // 读取现有配置
            let config;
            try {
                config = await this.readMappingConfig(configFilename);
            } catch (error) {
                // 如果文件不存在，创建新的配置
                config = {
                    version: '1.0.0',
                    last_updated: new Date().toISOString(),
                    mappings: {}
                };
            }

            // 更新映射
            config.mappings[clientToken] = {
                ...mapping,
                updated_at: new Date().toISOString()
            };
            config.last_updated = new Date().toISOString();

            // 验证配置
            const validation = this.validateMappingConfig(config);
            if (!validation.valid) {
                throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
            }

            // 写入配置
            await this.writeMappingConfig(config, configFilename);
        } catch (error) {
            throw new Error(`更新映射配置失败: ${error.message}`);
        }
    }

    /**
     * 删除映射配置
     * @param {string} clientToken - 客户端token
     * @param {string} filename - 配置文件名（可选）
     * @returns {Promise<void>}
     */
    async deleteMapping(clientToken, filename = null) {
        try {
            const configFilename = filename || this.configFile;
            const config = await this.readMappingConfig(configFilename);

            if (config.mappings[clientToken]) {
                delete config.mappings[clientToken];
                config.last_updated = new Date().toISOString();
                await this.writeMappingConfig(config, configFilename);
            }
        } catch (error) {
            throw new Error(`删除映射配置失败: ${error.message}`);
        }
    }

    /**
     * 列出所有映射配置
     * @param {string} filename - 配置文件名（可选）
     * @returns {Promise<Array>} 映射配置列表
     */
    async listMappings(filename = null) {
        try {
            const config = await this.readMappingConfig(filename);
            return Object.entries(config.mappings).map(([clientToken, mapping]) => ({
                client_token: clientToken,
                ...mapping
            }));
        } catch (error) {
            return [];
        }
    }

    /**
     * 清理过期的映射配置
     * @param {string} filename - 配置文件名（可选）
     * @returns {Promise<number>} 清理的映射数量
     */
    async cleanExpiredMappings(filename = null) {
        try {
            const configFilename = filename || this.configFile;
            const config = await this.readMappingConfig(configFilename);

            let cleanedCount = 0;
            const now = new Date();

            for (const [clientToken, mapping] of Object.entries(config.mappings)) {
                const expiresAt = new Date(mapping.expires_at);
                if (expiresAt < now) {
                    delete config.mappings[clientToken];
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                config.last_updated = new Date().toISOString();
                await this.writeMappingConfig(config, configFilename);
            }

            return cleanedCount;
        } catch (error) {
            console.error('清理过期映射失败:', error);
            return 0;
        }
    }

    /**
     * 确保映射目录存在
     */
    async ensureDirectory() {
        try {
            await fs.mkdir(this.mapDir, { recursive: true });
        } catch (error) {
            // 忽略目录已存在的错误
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }
}

module.exports = MappingConfigManager;