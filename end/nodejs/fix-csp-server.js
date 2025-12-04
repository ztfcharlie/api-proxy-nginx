#!/usr/bin/env node

/**
 * CSP修复版Web管理服务器
 * 解决Content Security Policy限制问题
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

class FixedCSPServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 8889;
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // 基本中间件
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // 完全移除CSP限制的中间件
        this.app.use((req, res, next) => {
            // 移除所有可能限制外部资源的安全头部
            res.removeHeader('Content-Security-Policy');
            res.removeHeader('Cross-Origin-Opener-Policy');
            res.removeHeader('Cross-Origin-Resource-Policy');
            res.removeHeader('X-Content-Type-Options');
            res.removeHeader('X-Frame-Options');
            res.removeHeader('X-XSS-Protection');

            // 设置允许跨域的头部
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.setHeader('Access-Control-Max-Age', '86400');

            next();
        });

        // 静态文件服务 - 必须在安全中间件之后
        this.app.use('/admin', express.static(path.join(__dirname, 'web/public')));
        this.app.use('/', express.static(path.join(__dirname, 'web/public')));
    }

    setupRoutes() {
        // 模拟用户API
        this.app.get('/api/clients', (req, res) => {
            res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
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
                    }
                ];
            }

            res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.json({
                success: true,
                data: accounts,
                timestamp: new Date().toISOString()
            });
        });

        // 其他API端点...
        this.app.post('/api/server-accounts', (req, res) => {
            res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.status(201).json({
                success: true,
                data: {
                    ...req.body,
                    id: Date.now(),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                timestamp: new Date().toISOString()
            });
        });

        this.app.put('/api/server-accounts/:id', (req, res) => {
            res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.json({
                success: true,
                data: {
                    ...req.body,
                    id: parseInt(req.params.id),
                    updated_at: new Date().toISOString()
                },
                timestamp: new Date().toISOString()
            });
        });

        this.app.delete('/api/server-accounts/:id', (req, res) => {
            res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.json({
                success: true,
                data: {
                    message: 'Service account deleted successfully',
                    id: req.params.id,
                    timestamp: new Date().toISOString()
                }
            });
        });

        // 健康检查 - 明确标识这是CSP修复版本
        this.app.get('/health', (req, res) => {
            res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.json({
                success: true,
                status: 'healthy',
                version: '1.0.0-csp-fixed',
                service: 'web-demo-fixed',
                timestamp: new Date().toISOString(),
                features: {
                    csp_disabled: true,
                    cors_enabled: true,
                    external_scripts_allowed: true
                }
            });
        });

        // 根路径重定向到管理界面
        this.app.get('/', (req, res) => {
            res.redirect('/admin/');
        });
    }

    start() {
        this.server = this.app.listen(this.port, '0.0.0.0', () => {
            console.log('🔧 CSP修复版Web管理界面启动成功！');
            console.log('==============================================');
            console.log(`📡 服务地址: http://0.0.0.0:${this.port}`);
            console.log(`🎨 管理界面: http://0.0.0.0:${this.port}/admin/`);
            console.log(`💾 API端点: http://0.0.0.0:${this.port}/api/`);
            console.log(`❤️  健康检查: http://0.0.0.0:${this.port}/health`);
            console.log('');
            console.log('🚨 CSP修复功能:');
            console.log('  ✅ 移除了Content-Security-Policy限制');
            console.log('  ✅ 移除了Cross-Origin-Opener-Policy');
            console.log('  ✅ 允许加载外部CDN资源');
            console.log('  ✅ 启用了CORS跨域支持');
            console.log('  ✅ React/Tailwind CSS等CDN现在可正常加载');
            console.log('');
            console.log('🚀 现在可以正常访问Web管理界面了！');
        });
    }

    stop() {
        if (this.server) {
            this.server.close(() => {
                console.log('🛑 CSP修复版Web服务已停止');
            });
        }
    }
}

// 启动服务
const server = new FixedCSPServer();
server.start();

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('\n🛑 收到停止信号，正在关闭服务...');
    server.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n🛑 收到中断信号，正在关闭服务...');
    server.stop();
    process.exit(0);
});