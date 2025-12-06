const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');

// 请把从管理后台下载的 JSON 内容粘贴到这里
// 或者保存为 client_credentials.json 并读取
// 这里为了演示，请手动填入
const serviceAccount = {
    "type": "service_account",
    "project_id": "virtual-project",
    // ... 填入您的 JSON ...
};

// 如果不想填，请在运行前设置环境变量: JSON_FILE=path/to/file.json
const jsonFile = process.env.JSON_FILE;
let config = serviceAccount;

if (jsonFile) {
    config = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
}

async function run() {
    if (!config.private_key) {
        console.error('Please provide a valid Service Account JSON!');
        return;
    }

    const tokenUri = config.token_uri || 'http://localhost:8889/oauth2.googleapis.com/token';
    console.log('Target URI:', tokenUri);

    // 1. 生成 JWT
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: config.client_email,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: tokenUri,
        exp: now + 3600,
        iat: now
    };

    const token = jwt.sign(payload, config.private_key, { algorithm: 'RS256' });
    console.log('Generated JWT:', token.substring(0, 20) + '...');

    // 2. 发起请求
    try {
        console.log('Requesting Access Token...');
        const res = await axios.post(tokenUri, {
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: token
        });

        console.log('Response:', res.data);
        console.log('SUCCESS! Virtual Token:', res.data.access_token);
    } catch (err) {
        console.error('Request failed:', err.response ? err.response.data : err.message);
    }
}

run();
