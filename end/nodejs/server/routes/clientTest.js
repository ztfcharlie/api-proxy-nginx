const express = require('express');
const router = express.Router();
const axios = require('axios');
const path = require('path');
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { GoogleAuth } = require('google-auth-library');
const db = require('../config/db').dbPool;

// 辅助函数：根据 ID 获取虚拟 Token 的内容 (Token Key)
// 注意：这里只获取虚拟 Token 本身，绝不查找真实渠道的 Key
async function getVirtualTokenContent(id) {
    try {
        const [rows] = await db.query(`SELECT token_key FROM sys_virtual_tokens WHERE id = ?`, [id]);
        if (rows.length > 0) {
            return rows[0].token_key;
        }
        return null;
    } catch (e) {
        console.error('Error fetching virtual token:', e);
        return null;
    }
}

// 核心路由：发送测试请求
router.post('/send', async (req, res) => {
    const { vendor, baseUrl, apiKey, path: apiPath, payload } = req.body;
    
    // 基础校验
    if (!baseUrl) return res.status(400).json({ error: 'Base URL is required' });

    let finalUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    // 确保 path 以 / 开头
    const safePath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    finalUrl = `${finalUrl}${safePath}`;

    try {
        let responseData;
        let responseStatus;
        let responseHeaders;
        let clientCredential = apiKey; 

        // ---------------------------------------------------------
        // AWS Bedrock (使用 Virtual Token 作为 AK/SK 模拟原生请求)
        // ---------------------------------------------------------
        if (vendor === 'aws-bedrock') {
            // 假设 Virtual Token 格式为 "ACCESS_KEY:SECRET_KEY" 或 "ACCESS_KEY:SECRET_KEY:REGION"
            let accessKeyId, secretAccessKey, region = 'us-east-1';
            
            if (typeof clientCredential === 'string' && clientCredential.includes(':')) {
                const parts = clientCredential.split(':');
                accessKeyId = parts[0];
                secretAccessKey = parts[1];
                if (parts.length > 2) region = parts[2];
            } else {
                 return res.status(400).json({ error: 'For AWS, Virtual Token must be in format "AK:SK" or "AK:SK:Region"' });
            }

            // 使用虚拟凭证初始化 SDK
            // SDK 会使用这个 AK/SK 对请求进行签名 (SigV4)
            // 我们的代理服务器收到请求后，会校验这个签名（验证请求确实来自持有该 Virtual Token 的用户）
            const client = new BedrockRuntimeClient({
                region: region,
                credentials: { accessKeyId, secretAccessKey },
                endpoint: baseUrl // 关键：SDK 发往我们的代理地址
            });

            const command = new InvokeModelCommand({
                modelId: payload.model || 'anthropic.claude-v2',
                body: JSON.stringify(payload),
                contentType: 'application/json'
            });

            try {
                const awsRes = await client.send(command);
                const decodedBody = new TextDecoder().decode(awsRes.body);
                responseData = JSON.parse(decodedBody);
                responseStatus = 200;
                responseHeaders = awsRes.$metadata;
            } catch (awsErr) {
                throw {
                    response: {
                        status: awsErr.$metadata ? awsErr.$metadata.httpStatusCode : 500,
                        data: awsErr.message
                    }
                };
            }
        } 
        
        // ---------------------------------------------------------
        // Google Vertex AI (使用 Virtual Token 模拟 Service Account)
        // ---------------------------------------------------------
        else if (vendor === 'google-vertex') {
            // 如果 Virtual Token 是 JSON 字符串 (模拟 Key File)，则使用 GoogleAuth
            // 如果是普通字符串，则假设是 Access Token
            let accessToken = clientCredential;

            if (typeof clientCredential === 'string' && clientCredential.trim().startsWith('{')) {
                try {
                    const keyFile = JSON.parse(clientCredential);
                    // 使用虚拟的 Key File 进行本地签名
                    const auth = new GoogleAuth({
                        credentials: keyFile,
                        scopes: ['https://www.googleapis.com/auth/cloud-platform']
                    });
                    const client = await auth.getClient();
                    // 这里会生成一个基于 Virtual Key 的 JWT 或 Access Token
                    const tokenRes = await client.getAccessToken();
                    accessToken = tokenRes.token;
                } catch (e) {
                    console.warn("Failed to parse Virtual Token as JSON for GoogleAuth, using as raw string.", e);
                }
            }

            // 发送请求到代理
            const result = await axios.post(finalUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`, // 带着虚拟签名/Token
                    'Content-Type': 'application/json'
                },
                validateStatus: () => true 
            });
            responseData = result.data;
            responseStatus = result.status;
            responseHeaders = result.headers;
        }

        // ---------------------------------------------------------
        // OpenAI / DeepSeek / Azure / Others (Header Auth)
        // ---------------------------------------------------------
        else {
            const headers = { 'Content-Type': 'application/json' };
            
            // 确保 realCredentials 是字符串
            const keyString = typeof realCredentials === 'object' ? JSON.stringify(realCredentials) : realCredentials;

            if (vendor === 'anthropic') {
                headers['x-api-key'] = keyString;
                headers['anthropic-version'] = '2023-06-01';
            } else if (vendor === 'azure-openai') {
                headers['api-key'] = keyString;
            } else {
                headers['Authorization'] = `Bearer ${keyString}`;
            }

            console.log(`[ClientTest] Sending request to: ${finalUrl}`);
            console.log(`[ClientTest] Method: POST`);
            console.log(`[ClientTest] Headers:`, JSON.stringify(headers));

            const result = await axios.post(finalUrl, payload, {
                headers,
                validateStatus: () => true
            });
            
            responseData = result.data;
            responseStatus = result.status;
            responseHeaders = result.headers;
        }

        res.json({
            status: responseStatus,
            headers: responseHeaders,
            data: responseData
        });

    } catch (error) {
        console.error('Proxy Request Failed:', error);
        res.status(error.response?.status || 500).json({
            error: 'Request Failed',
            details: error.response?.data || error.message,
            raw_error: error.toString()
        });
    }
});

// 获取所有 Virtual Tokens (仅从 sys_virtual_tokens 表)
router.get('/tokens', async (req, res) => {
    try {
        const query = `
            SELECT t.id, t.token_key, t.type, u.username, t.name as token_name
            FROM sys_virtual_tokens t
            LEFT JOIN sys_users u ON t.user_id = u.id
            WHERE t.status = 1
            ORDER BY t.id DESC
        `;
        const [rows] = await db.query(query);

        // 返回给前端：ID用于后续查找，Label用于展示
        const tokens = rows.map(row => ({
            label: `[${row.type}] ${row.token_name || row.token_key} (${row.username || 'No User'})`,
            value: row.token_key, // Send actual token key, not ID
            service_type: row.type
        }));

        res.json(tokens);
    } catch (e) {
        console.error("Failed to load tokens from DB:", e);
        res.status(500).json({ error: 'Failed to load tokens' });
    }
});

module.exports = router;