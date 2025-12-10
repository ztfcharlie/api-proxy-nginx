const express = require('express');
const router = express.Router();

/**
 * @route GET /
 * @desc OAuth2 Mock Service 首页
 * @access Public
 */
router.get('/', (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Universal AI Gateway</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            background: white;
            border-radius: 10px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 2rem;
        }
        .header h1 {
            color: #4a5568;
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }
        .header p {
            color: #718096;
            font-size: 1.2rem;
        }
        .status {
            display: inline-block;
            padding: 0.5rem 1rem;
            background: #48bb78;
            color: white;
            border-radius: 20px;
            font-weight: bold;
            margin-bottom: 2rem;
        }
        .endpoints {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        .endpoint-card {
            padding: 1.5rem;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            background: #f7fafc;
        }
        .endpoint-card h3 {
            color: #2d3748;
            margin-bottom: 0.5rem;
        }
        .endpoint-card p {
            color: #4a5568;
            margin-bottom: 1rem;
            font-size: 0.9rem;
        }
        .endpoint-url {
            font-family: 'Courier New', monospace;
            background: #2d3748;
            color: #48bb78;
            padding: 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
            word-break: break-all;
        }
        .docs-link {
            text-align: center;
            margin-top: 2rem;
        }
        .docs-link a {
            display: inline-block;
            padding: 0.75rem 2rem;
            background: #4299e1;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            transition: background 0.3s;
        }
        .docs-link a:hover {
            background: #3182ce;
        }
        .footer {
            text-align: center;
            margin-top: 2rem;
            color: #718096;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Universal AI Gateway</h1>
            <p>API Endpoint & OAuth2 Service</p>
            <div class="status">✅ 服务运行中</div>
        </div>

        <div class="endpoints">
            <div class="endpoint-card">
                <h3>🔑 OAuth2 Token</h3>
                <p>获取访问令牌的端点，模拟 Google OAuth2 token 接口</p>
                <div class="endpoint-url">POST /accounts.google.com/oauth2/token</div>
            </div>

            <div class="endpoint-card">
                <h3>🔒 OAuth2 Certs</h3>
                <p>获取 Google 公钥证书，用于验证 JWT 令牌</p>
                <div class="endpoint-url">GET /accounts.google.com/oauth2/v1/certs</div>
            </div>

            <div class="endpoint-card">
                <h3>💚 健康检查</h3>
                <p>检查服务运行状态和依赖连接</p>
                <div class="endpoint-url">GET /health</div>
            </div>

            <div class="endpoint-card">
                <h3>📚 API 文档</h3>
                <p>Swagger 接口文档和测试工具</p>
                <div class="endpoint-url">GET /api-docs</div>
            </div>
        </div>

        <div class="docs-link">
            <a href="/api-docs" target="_blank">📖 查看完整 API 文档</a>
        </div>

        <div class="footer">
            <p>版本: 3.0.0 | 时间: ${new Date().toISOString()}</p>
        </div>
    </div>
</body>
</html>
    `;

    res.send(html);
});

// Admin Log Routes
const logsRouter = require('./admin/logs');
router.use('/api/admin/logs', logsRouter);

module.exports = router;