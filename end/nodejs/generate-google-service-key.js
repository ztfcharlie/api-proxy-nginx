#!/usr/bin/env node

// 生成模拟Google服务账号Vertex JSON Key的工具
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class GoogleServiceKeyGenerator {
    constructor() {
        this.projectId = 'oauth2-mock-project';
        this.serviceAccountId = 'oauth2-mock-service@oauth2-mock-project.iam.gserviceaccount.com';
        this.keyId = `key_${Date.now()}`;
        this.privateKeyId = crypto.randomBytes(32).toString('base64url');
    }

    generatePrivateKey() {
        // 生成RSA私钥（简化版，实际应用中应使用更安全的密钥生成）
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });

        return { privateKey, publicKey };
    }

    generateServiceAccountKey() {
        const { privateKey, publicKey } = this.generatePrivateKey();

        const serviceAccountKey = {
            type: 'service_account',
            project_id: this.projectId,
            private_key_id: this.privateKeyId,
            private_key: privateKey,
            client_email: this.serviceAccountId,
            client_id: `100000000000000000001`,
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
            auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
            client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/oauth2-mock-service%40oauth2-mock-project.iam.gserviceaccount.com'
        };

        return {
            serviceAccountKey,
            publicKey
        };
    }

    generateVertexAIServiceAccountKey() {
        // 生成专门用于Vertex AI的服务账号密钥
        const vertexServiceAccount = {
            type: 'service_account',
            project_id: this.projectId,
            private_key_id: this.privateKeyId,
            private_key: this.generatePrivateKey().privateKey,
            client_email: `vertex-ai-sa@${this.projectId}.iam.gserviceaccount.com`,
            client_id: `100000000000000000002`,
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
            auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
            client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/vertex-ai-sa%40${this.projectId}.iam.gserviceaccount.com`,
            scopes: [
                'https://www.googleapis.com/auth/cloud-platform',
                'https://www.googleapis.com/auth/aiplatform'
            ]
        };

        return vertexServiceAccount;
    }

    saveKeyToFile(serviceAccountKey, filename) {
        const filePath = path.join(__dirname, '../data/client/google_server_account', filename);

        // 确保目录存在
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, JSON.stringify(serviceAccountKey, null, 2));
        console.log(`✅ 服务账号密钥已保存到: ${filePath}`);
        return filePath;
    }

    generateMockServiceAccountJson() {
        // 生成简化的服务账号JSON（用于测试）
        const mockServiceAccount = {
            type: 'service_account',
            project_id: this.projectId,
            private_key_id: this.privateKeyId,
            private_key: `-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC5G2X...MOCKqG3mKb74wK7T\n-----END PRIVATE KEY-----\n`,
            client_email: this.serviceAccountId,
            client_id: '100000000000000000001',
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
            auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
            client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/oauth2-mock-service%40oauth2-mock-project.iam.gserviceaccount.com'
        };

        return mockServiceAccount;
    }
}

// 主执行函数
function main() {
    console.log('🔑 生成Google服务账号Vertex JSON Key');
    console.log('==================================');

    const generator = new GoogleServiceKeyGenerator();

    try {
        // 1. 生成标准服务账号密钥
        console.log('\n1️⃣ 生成标准服务账号密钥');
        const { serviceAccountKey } = generator.generateServiceAccountKey();
        const standardKeyPath = generator.saveKeyToFile(serviceAccountKey, 'google-service-account-key.json');

        // 2. 生成Vertex AI专用服务账号密钥
        console.log('\n2️⃣ 生成Vertex AI专用服务账号密钥');
        const vertexKey = generator.generateVertexAIServiceAccountKey();
        const vertexKeyPath = generator.saveKeyToFile(vertexKey, 'vertex-ai-service-account-key.json');

        // 3. 生成简化的Mock服务账号密钥
        console.log('\n3️⃣ 生成简化的Mock服务账号密钥');
        const mockKey = generator.generateMockServiceAccountJson();
        const mockKeyPath = generator.saveKeyToFile(mockKey, 'mock-service-account-key.json');

        // 4. 输出密钥信息摘要
        console.log('\n📋 生成的密钥摘要:');
        console.log('===================');
        console.log(`项目ID: ${generator.projectId}`);
        console.log(`服务账号: ${generator.serviceAccountId}`);
        console.log(`密钥ID: ${generator.privateKeyId}`);
        console.log('');
        console.log('📁 文件位置:');
        console.log(`- 标准密钥: ${standardKeyPath}`);
        console.log(`- Vertex AI密钥: ${vertexKeyPath}`);
        console.log(`- Mock密钥: ${mockKeyPath}`);

        // 5. 生成使用示例
        console.log('\n💡 使用示例:');
        console.log('================');
        console.log('# 1. 在Node.js中使用:');
        console.log('const serviceAccount = require("./google-service-account-key.json");');
        console.log('const {GoogleAuth} = require("google-auth-library");');
        console.log('const auth = new GoogleAuth({');
        console.log('  credentials: serviceAccount,');
        console.log('  scopes: ["https://www.googleapis.com/auth/cloud-platform"]');
        console.log('});');
        console.log('');
        console.log('# 2. 在Python中使用:');
        console.log('from google.oauth2 import service_account');
        console.log('credentials = service_account.Credentials.from_service_account_file(');
        console.log('    "google-service-account-key.json")');
        console.log('');
        console.log('# 3. 环境变量设置:');
        console.log('export GOOGLE_APPLICATION_CREDENTIALS="./google-service-account-key.json"');

    } catch (error) {
        console.error('❌ 生成密钥时出错:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = GoogleServiceKeyGenerator;