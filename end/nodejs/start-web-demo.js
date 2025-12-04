#!/usr/bin/env node

/**
 * Web管理界面演示启动脚本
 * 在没有数据库的情况下启动Web界面演示
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

class WebDemoServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 8889;
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // 静态文件服务
        this.app.use('/admin', express.static(path.join(__dirname, 'web/public')));

        // 基本路由
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
    }

    setupRoutes() {
        // 模拟用户API
        this.app.get('/api/clients', (req, res) => {
            res.json({
                success: true,
                data: [
                    {
                        id: 1,
                        client_id: 'gemini-client-key-aaaa',
                        client_name: 'Gemini Client A',
                        description: 'Google Gemini API client',
                        service_type: 'google',
                        is_active: true,
                        rate_limit: 1000,
                        last_used: new Date().toISOString(),
                        created_at: '2024-01-01T00:00:00Z',
                        updated_at: '2024-01-01T00:00:00Z',
                        key_filename_gemini: [
                            {
                                key_filename: 'hulaoban-202504.json',
                                key_weight: 1
                            }
                        ]
                    },
                    {
                        id: 2,
                        client_id: 'vertex-client-key-bbbb',
                        client_name: 'Vertex Client B',
                        description: 'Google Vertex AI client',
                        service_type: 'google',
                        is_active: true,
                        rate_limit: 500,
                        last_used: new Date().toISOString(),
                        created_at: '2024-01-02T00:00:00Z',
                        updated_at: '2024-01-02T00:00:00Z',
                        key_filename_gemini: []
                    }
                ],
                timestamp: new Date().toISOString()
            });
        });

        // 模拟服务账号API
        this.app.get('/api/server-accounts', (req, res) => {
            const { client_token } = req.query;

            let accounts = [];

            if (client_token === 'gemini-client-key-aaaa') {
                accounts = [
                    {
                        id: 1,
                        service_account_id: 'sa-001',
                        display_name: 'Gemini API Service Account',
                        service_account_email: 'gemini-sa-001@oauth2-mock-project.iam.gserviceaccount.com',
                        key_filename: 'gemini-service-key-2024.json',
                        service_type: 'google',
                        enabled: true,
                        created_at: '2024-01-15T10:30:00Z',
                        updated_at: '2024-01-15T10:30:00Z',
                        client_id: client_token
                    },
                    {
                        id: 2,
                        service_account_id: 'sa-002',
                        display_name: 'Vertex AI Service Account',
                        service_account_email: 'vertex-ai-sa-002@oauth2-mock-project.iam.gserviceaccount.com',
                        key_filename: 'vertex-ai-key-2024.json',
                        service_type: 'google',
                        enabled: true,
                        created_at: '2024-01-20T14:15:00Z',
                        updated_at: '2024-01-20T14:15:00Z',
                        client_id: client_token
                    }
                ];
            }

            res.json({
                success: true,
                data: accounts,
                timestamp: new Date().toISOString()
            });
        });

        // 模拟创建服务账号
        this.app.post('/api/server-accounts', (req, res) => {
            const newAccount = {
                id: Date.now(),
                service_account_id: `sa-${Date.now()}`,
                display_name: req.body.display_name,
                service_account_email: req.body.service_account_email || `${req.body.client_token}-service-${Date.now()}@oauth2-mock-project.iam.gserviceaccount.com`,
                key_filename: req.body.key_filename || `${req.body.client_token}-service-account-${Date.now()}.json`,
                service_type: req.body.service_type || 'google',
                enabled: req.body.enabled !== false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                client_id: req.body.client_token,
                project_id: 'oauth2-mock-project',
                private_key_id: `key_${Date.now()}`,
                private_key: `-----BEGIN PRIVATE KEY-----\\n${Buffer.from('demo-key').toString('base64')}\\n-----END PRIVATE KEY-----`
            };

            console.log('🎉 模拟创建服务账号:', newAccount.display_name);

            res.status(201).json({
                success: true,
                data: newAccount,
                timestamp: new Date().toISOString()
            });
        });

        // 模拟更新服务账号
        this.app.put('/api/server-accounts/:id', (req, res) => {
            const { id } = req.params;

            console.log('📝 模拟更新服务账号:', id, req.body);

            res.json({
                success: true,
                data: {
                    ...req.body,
                    id: parseInt(id),
                    updated_at: new Date().toISOString()
                },
                timestamp: new Date().toISOString()
            });
        });

        // 模拟删除服务账号
        this.app.delete('/api/server-accounts/:id', (req, res) => {
            const { id } = req.params;

            console.log('🗑️ 模拟删除服务账号:', id);

            res.json({
                success: true,
                data: {
                    message: 'Service account deleted successfully',
                    id: id,
                    timestamp: new Date().toISOString()
                }
            });
        });

        // 模拟重新生成密钥
        this.app.post('/api/server-accounts/:id/regenerate-key', (req, res) => {
            const { id } = req.params;

            console.log('🔄 模拟重新生成密钥:', id);

            res.json({
                success: true,
                data: {
                    id: id,
                    private_key_id: `key_${Date.now()}`,
                    private_key: `-----BEGIN PRIVATE KEY-----\\n${Buffer.from('new-demo-key-' + Date.now()).toString('base64')}\\n-----END PRIVATE KEY-----`,
                    regenerated_at: new Date().toISOString(),
                    message: 'Service account key regenerated successfully'
                }
            });
        });

        // 健康检查
        this.app.get('/health', (req, res) => {
            res.json({
                success: true,
                status: 'healthy',
                timestamp: new Date().toISOString(),
                services: {
                    web_demo: 'running',
                    database: 'not_connected',
                    redis: 'not_connected'
                }
            });
        });

        // 根路径
        this.app.get('/', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>OAuth2 Web管理界面演示</title>
                    <meta charset="UTF-8">
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 20px;
                            background-color: #f5f5f5;
                        }
                        .container {
                            background: white;
                            padding: 30px;
                            border-radius: 10px;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        }
                        .button {
                            display: inline-block;
                            padding: 12px 24px;
                            margin: 10px 5px;
                            background-color: #007bff;
                            color: white;
                            text-decoration: none;
                            border-radius: 5px;
                            border: none;
                            cursor: pointer;
                            font-size: 14px;
                        }
                        .success {
                            background-color: #28a745;
                        }
                        .info {
                            background-color: #17a2b8;
                        }
                        .status {
                            background-color: #ffc107;
                            color: #212529;
                        }
                        h1 { color: #333; }
                        h2 { color: #666; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🎉 OAuth2 Web管理界面演示</h1>

                        <div class="status">
                            <strong>✅ 状态:</strong> Web演示服务正在运行
                        </div>

                        <h2>🚀 快速访问</h2>
                        <a href="/admin/" class="button success" target="_blank">打开Web管理界面</a>
                        <a href="/health" class="button info" target="_blank">检查服务状态</a>

                        <h2>📋 演示功能</h2>
                        <ul>
                            <li>✅ 用户管理 - 查看和选择用户</li>
                            <li>✅ 服务账号查看 - 卡片式展示</li>
                            <li>✅ 服务账号创建 - 表单创建新账号</li>
                            <li>✅ 服务账号编辑 - 修改账号信息</li>
                            <li>✅ 服务账号删除 - 安全删除账号</li>
                            <li>✅ 密钥重新生成 - 生成新的私钥</li>
                            <li>✅ 实时通知 - 操作反馈</li>
                        </ul>

                        <h2>📱 访问地址</h2>
                        <p><strong>管理界面:</strong> <a href="/admin/" target="_blank">http://localhost:${this.port}/admin/</a></p>
                        <p><strong>API测试:</strong> <a href="/api/clients" target="_blank">/api/clients</a></p>

                        <h2>🔧 技术说明</h2>
                        <p>这是一个完整的Web管理界面演示，包含React + Tailwind CSS前端和Express后端API。所有功能都在内存中模拟，无需数据库支持。</p>

                        <div style="margin-top: 30px; padding: 15px; background-color: #e9ecef; border-radius: 5px;">
                            <strong>💡 提示:</strong> 点击"打开Web管理界面"来体验完整的管理功能！
                        </div>
                    </div>
                </body>
                </html>
            `);
        });
    }

    start() {
        this.server = this.app.listen(this.port, () => {
            console.log('🎉 Web管理界面演示服务启动成功！');
            console.log('=======================================');
            console.log(`📡 服务地址: http://localhost:${this.port}`);
            console.log(`🎨 Web管理界面: http://localhost:${this.port}/admin/`);
            console.log(`💾 API端点: http://localhost:${this.port}/api/`);
            console.log(`❤️  健康检查: http://localhost:${this.port}/health`);
            console.log('');
            console.log('🎯 演示功能:');
            console.log('  ✅ React + Tailwind CSS 管理界面');
            console.log('  ✅ 完整的CRUD操作');
            console.log('  ✅ 模拟API响应');
            console.log('  ✅ 实时通知系统');
            console.log('  ✅ 响应式设计');
            console.log('');
            console.log('🚀 现在可以访问Web管理界面了！');
        });
    }

    stop() {
        if (this.server) {
            this.server.close(() => {
                console.log('🛑 Web演示服务已停止');
            });
        }
    }
}

// 启动演示服务
const demo = new WebDemoServer();
demo.start();

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('\n🛑 收到停止信号，正在关闭服务...');
    demo.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n🛑 收到中断信号，正在关闭服务...');
    demo.stop();
    process.exit(0);
});