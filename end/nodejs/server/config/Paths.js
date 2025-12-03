/**
 * 路径配置管理
 * 统一管理应用中使用的所有路径配置
 */

const path = require('path');

class Paths {
    constructor() {
        // 基础路径配置（容器内路径）
        this.baseDir = '/app';

        // 从环境变量或使用默认值
        this.logDir = process.env.LOG_DIR || path.join(this.baseDir, 'logs');
        this.tmpDir = process.env.TMP_DIR || path.join(this.baseDir, 'tmp');
        this.clientDir = process.env.CLIENT_DIR || path.join(this.baseDir, 'client');

        // 子目录路径
        this.googleServerAccountDir = path.join(this.clientDir, 'google_server_account');
    }

    /**
     * 获取日志目录路径
     */
    getLogDir() {
        return this.logDir;
    }

    /**
     * 获取临时文件目录路径
     */
    getTmpDir() {
        return this.tmpDir;
    }

    /**
     * 获取客户端文件目录路径
     */
    getClientDir() {
        return this.clientDir;
    }

    /**
     * 获取服务账号文件目录路径
     */
    getGoogleServerAccountDir() {
        return this.googleServerAccountDir;
    }

    /**
     * 获取日志文件路径
     */
    getLogFile(filename) {
        return path.join(this.logDir, filename);
    }

    /**
     * 获取临时文件路径
     */
    getTmpFile(filename) {
        return path.join(this.tmpDir, filename);
    }

    /**
     * 获取服务账号文件路径
     */
    getGoogleServerAccountFile(filename) {
        return path.join(this.googleServerAccountDir, filename);
    }

    /**
     * 创建必要的目录
     */
    ensureDirectories() {
        const fs = require('fs');

        const directories = [
            this.logDir,
            this.tmpDir,
            this.clientDir,
            this.googleServerAccountDir
        ];

        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`创建目录: ${dir}`);
            }
        });
    }

    /**
     * 获取路径配置摘要（用于调试）
     */
    getPathSummary() {
        return {
            logDir: this.logDir,
            tmpDir: this.tmpDir,
            clientDir: this.clientDir,
            googleServerAccountDir: this.googleServerAccountDir,
            baseDir: this.baseDir
        };
    }
}

// 导出单例实例
module.exports = new Paths();