/**
 * 服务账号管理工具
 * 处理Google服务账号JSON文件的读取和管理
 */

const fs = require('fs').promises;
const path = require('path');
const Paths = require('../config/Paths');

class ServiceAccountManager {
    constructor() {
        this.serviceAccountDir = Paths.getGoogleServerAccountDir();
    }

    /**
     * 读取服务账号文件内容
     * @param {string} filename - 服务账号文件名
     * @returns {Promise<Object>} 服务账号配置对象
     */
    async readServiceAccount(filename) {
        try {
            const filePath = this.getServiceAccountPath(filename);
            const content = await fs.readFile(filePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            throw new Error(`读取服务账号文件失败 ${filename}: ${error.message}`);
        }
    }

    /**
     * 写入服务账号文件
     * @param {string} filename - 文件名
     * @param {Object} data - 服务账号配置数据
     * @returns {Promise<void>}
     */
    async writeServiceAccount(filename, data) {
        try {
            const filePath = this.getServiceAccountPath(filename);
            const content = JSON.stringify(data, null, 2);
            await fs.writeFile(filePath, content, 'utf8');
        } catch (error) {
            throw new Error(`写入服务账号文件失败 ${filename}: ${error.message}`);
        }
    }

    /**
     * 删除服务账号文件
     * @param {string} filename - 文件名
     * @returns {Promise<void>}
     */
    async deleteServiceAccount(filename) {
        try {
            const filePath = this.getServiceAccountPath(filename);
            await fs.unlink(filePath);
        } catch (error) {
            throw new Error(`删除服务账号文件失败 ${filename}: ${error.message}`);
        }
    }

    /**
     * 列出所有服务账号文件
     * @returns {Promise<string[]>} 文件名列表
     */
    async listServiceAccounts() {
        try {
            const files = await fs.readdir(this.serviceAccountDir);
            return files.filter(file => file.endsWith('.json'));
        } catch (error) {
            // 如果目录不存在，返回空数组
            return [];
        }
    }

    /**
     * 检查服务账号文件是否存在
     * @param {string} filename - 文件名
     * @returns {Promise<boolean>} 是否存在
     */
    async serviceAccountExists(filename) {
        try {
            const filePath = this.getServiceAccountPath(filename);
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 验证服务账号文件格式
     * @param {Object} data - 服务账号数据
     * @returns {boolean} 是否有效
     */
    validateServiceAccount(data) {
        const requiredFields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email', 'client_id'];

        if (!data || typeof data !== 'object') {
            return false;
        }

        return requiredFields.every(field => {
            return data[field] && typeof data[field] === 'string';
        });
    }

    /**
     * 获取服务账号文件的完整路径
     * @param {string} filename - 文件名
     * @returns {string} 完整路径
     */
    getServiceAccountPath(filename) {
        // 确保文件名以.json结尾
        const normalizedFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
        return path.join(this.serviceAccountDir, normalizedFilename);
    }

    /**
     * 确保服务账号目录存在
     */
    async ensureDirectory() {
        try {
            await fs.mkdir(this.serviceAccountDir, { recursive: true });
        } catch (error) {
            // 忽略目录已存在的错误
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    /**
     * 批量读取所有服务账号
     * @returns {Promise<Array>} 服务账号配置列表
     */
    async readAllServiceAccounts() {
        const files = await this.listServiceAccounts();
        const serviceAccounts = [];

        for (const filename of files) {
            try {
                const data = await this.readServiceAccount(filename);
                serviceAccounts.push({
                    filename,
                    data
                });
            } catch (error) {
                console.warn(`读取服务账号文件失败 ${filename}:`, error.message);
            }
        }

        return serviceAccounts;
    }

    /**
     * 根据邮箱查找服务账号
     * @param {string} email - 服务账号邮箱
     * @returns {Promise<Object|null>} 服务账号配置或null
     */
    async findServiceAccountByEmail(email) {
        const serviceAccounts = await this.readAllServiceAccounts();

        for (const serviceAccount of serviceAccounts) {
            if (serviceAccount.data.client_email === email) {
                return serviceAccount;
            }
        }

        return null;
    }

    /**
     * 根据项目ID查找服务账号
     * @param {string} projectId - 项目ID
     * @returns {Promise<Array>} 服务账号配置列表
     */
    async findServiceAccountsByProject(projectId) {
        const serviceAccounts = await this.readAllServiceAccounts();

        return serviceAccounts.filter(serviceAccount =>
            serviceAccount.data.project_id === projectId
        );
    }
}

module.exports = ServiceAccountManager;