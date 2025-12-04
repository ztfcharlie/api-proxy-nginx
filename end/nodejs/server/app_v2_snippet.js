const express = require('express');
const cors = require('cors');
// ... 其他引入 ...
const GoogleTokenJob = require('./services/GoogleTokenJob');
const SyncManager = require('./services/SyncManager');
const oauth2MockRoutes = require('./routes/oauth2_mock');

class OAuth2MockServer {
    constructor() {
        this.app = express();
        // ... 初始化代码 ...
    }
    
    // ... setupMiddlewares 等 ...

    setupRoutes() {
        // ... 原有路由 ...
        
        // 挂载新的 OAuth2 模拟路由
        // 注意：这个路径要匹配 Nginx 转发过来的路径
        this.app.use('/oauth2', oauth2MockRoutes);
    }

    async start() {
        // ... 原有启动代码 ...
        
        // --- 新增逻辑 ---
        
        // 1. 启动 Google Token 刷新任务
        const tokenJob = new GoogleTokenJob();
        tokenJob.start();
        
        // 2. 执行一次全量数据同步
        const syncManager = new SyncManager();
        await syncManager.syncAll();
        
        console.log('Background jobs started.');
        
        // ... 监听端口 ...
        this.app.listen(this.port, () => {
            console.log(`Server running on port ${this.port}`);
        });
    }
}

// ...
