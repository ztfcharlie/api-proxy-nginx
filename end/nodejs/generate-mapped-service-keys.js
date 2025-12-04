#!/usr/bin/env node

// 生成映射到用户配置的Google服务账号密钥
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class MappedServiceKeyGenerator {
    constructor() {
        this.projectId = 'oauth2-mock-project';
        this.configPath = path.join(__dirname, '../data/map/map-config.json');
        this.outputPath = path.join(__dirname, '../data/client/google_server_account');
        this.loadUserConfig();
    }

    loadUserConfig() {
        try {
            const configData = fs.readFileSync(this.configPath, 'utf8');
            this.userConfig = JSON.parse(configData);
            console.log(`✅ 成功加载用户配置: ${this.userConfig.clients.length} 个客户端`);
        } catch (error) {
            console.error('❌ 加载用户配置失败:', error.message);
            process.exit(1);
        }
    }

    generatePrivateKey() {
        const { privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        return privateKey;
    }

    createUserServiceAccountKey(clientToken) {
        // 为每个用户生成专属的服务账号密钥
        const timestamp = Date.now();
        const privateKeyId = `key_${timestamp}_${Buffer.from(clientToken).toString('hex').slice(0, 8)}`;

        // 将用户ID作为client_email的一部分
        const serviceAccountId = `${clientToken}@${this.projectId}.iam.gserviceaccount.com`;

        // 使用用户ID的哈希作为client_id
        const clientIdHash = crypto.createHash('sha256').update(clientToken).digest('hex');
        const clientId = `100${clientIdHash.slice(0, 17)}`;

        const serviceAccountKey = {
            type: 'service_account',
            project_id: this.projectId,
            private_key_id: privateKeyId,
            private_key: this.generatePrivateKey(),
            client_email: serviceAccountId,
            client_id: clientId,
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
            auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
            client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(serviceAccountId)}`,
            // 添加用户映射信息
            user_mapping: {
                client_token: clientToken,
                original_client_id: clientId,
                created_at: new Date().toISOString()
            }
        };

        return {
            filename: `${clientToken}-service-account.json`,
            keyData: serviceAccountKey
        };
    }

    generateKeysForAllUsers() {
        console.log('\n🔑 为所有用户生成映射的服务账号密钥');
        console.log('==================================');

        // 确保输出目录存在
        if (!fs.existsSync(this.outputPath)) {
            fs.mkdirSync(this.outputPath, { recursive: true });
        }

        const generatedKeys = [];

        // 为每个启用用户生成密钥
        for (const client of this.userConfig.clients) {
            if (!client.enable) {
                console.log(`⏭️  跳过已禁用的用户: ${client.client_token}`);
                continue;
            }

            console.log(`🔐 为用户 ${client.client_token} 生成服务账号密钥...`);

            const { filename, keyData } = this.createUserServiceAccountKey(client.client_token);

            // 保存密钥文件
            const filePath = path.join(this.outputPath, filename);
            fs.writeFileSync(filePath, JSON.stringify(keyData, null, 2));

            generatedKeys.push({
                client_token: client.client_token,
                filename: filename,
                service_account: keyData.client_email,
                client_id: keyData.client_id,
                file_path: filePath,
                key_files: client.key_filename_gemini || []
            });

            console.log(`   ✅ 生成完成: ${filename}`);
            console.log(`   📧  邮箱: ${keyData.client_email}`);
            console.log(`   🆔  客户ID: ${keyData.client_id}`);
        }

        return generatedKeys;
    }

    createKeyMappingIndex(generatedKeys) {
        console.log('\n📋 创建密钥映射索引');
        console.log('===================');

        const keyMapping = {
            created_at: new Date().toISOString(),
            project_id: this.projectId,
            total_users: generatedKeys.length,
            users: {}
        };

        for (const key of generatedKeys) {
            keyMapping.users[key.client_token] = {
                service_account_file: key.filename,
                service_account_email: key.service_account,
                client_id: key.client_id,
                key_files: key.key_files,
                enabled: true
            };
        }

        // 保存映射索引
        const mappingPath = path.join(this.outputPath, 'key-mapping-index.json');
        fs.writeFileSync(mappingPath, JSON.stringify(keyMapping, null, 2));

        console.log(`✅ 映射索引已保存到: ${mappingPath}`);
        return keyMapping;
    }

    createUsageInstructions() {
        const instructions = `
# Google服务账号密钥使用说明

## 📋 文件说明

生成的文件位置: \`${this.outputPath}\`

### 1. 服务账号密钥文件
- \`{generatedKeys.map(k => k.filename).join(', ')}\`
- 每个用户都有专属的服务账号密钥

### 2. 映射索引文件
- \`key-mapping-index.json\`
- 包含用户ID到密钥文件的完整映射关系

## 🔍 如何查找用户密钥

### 方法1: 通过映射索引查询
\`\`\`javascript
const mapping = require('./key-mapping-index.json');
const userToken = 'gemini-client-key-aaaa';
const userInfo = mapping.users[userToken];
console.log(\`用户密钥文件: \${userInfo.service_account_file}\`);
\`\`\`

### 方法2: 通过文件名直接查找
\`\`\`bash
ls -la ./google_server_account/ | grep 'gemini-client-key-aaaa'
# 或者直接加载对应的服务账号文件
const serviceAccount = require('./google_server_account/gemini-client-key-aaaa-service-account.json');
console.log(serviceAccount.client_email);
\`\`\`

## 🔑 在应用中使用

### Node.js 使用示例
\`\`\`javascript
// 1. 加载映射索引
const keyMapping = require('./google_server_account/key-mapping-index.json');

// 2. 根据用户Token查找密钥
function getServiceAccountKey(userToken) {
    const userInfo = keyMapping.users[userToken];
    if (!userInfo) {
        throw new Error(\`用户 \${userToken} 未找到对应的服务账号密钥\`);
    }

    return require(\`./google_server_account/\${userInfo.service_account_file}\`);
}

// 3. 使用示例
const userToken = 'gemini-client-key-aaaa';
const serviceAccount = getServiceAccountKey(userToken);
console.log(\`服务账号邮箱: \${serviceAccount.client_email}\`);
\`\`\`

### Python 使用示例
\`\`\`python
import json

# 1. 加载映射索引
with open('./google_server_account/key-mapping-index.json', 'r') as f:
    key_mapping = json.load(f)

# 2. 根据用户Token查找密钥
def get_service_account_key(user_token):
    user_info = key_mapping['users'].get(user_token)
    if not user_info:
        raise ValueError(f"用户 {user_token} 未找到对应的服务账号密钥")

    key_file_path = f'./google_server_account/{user_info["service_account_file"]}'
    with open(key_file_path, 'r') as f:
        return json.load(f)

# 3. 使用示例
user_token = 'gemini-client-key-aaaa'
service_account = get_service_account_key(user_token)
print(f"服务账号邮箱: {service_account['client_email']}")
\`\`\`

## 🔐 OAuth2 Token生成流程

1. **用户请求**: 使用 \`gemini-client-key-aaaa\` 请求Token
2. **查找密钥**: 在 \`key-mapping-index.json\` 中查找对应的服务账号
3. **生成Token**: 使用找到的服务账号密钥生成有效的访问令牌
4. **Token映射**: 将内部Token映射到Google OAuth2兼容的Token

## 📊 配置对应关系

\`\`\`json
用户配置 (map-config.json):
{
  "client_token": "gemini-client-key-aaaa",
  "key_filename_gemini": ["hulaoban-202504.json"]
}

↓ ↓ ↓ ↓

生成的服务账号:
{
  "client_email": "gemini-client-key-aaaa@oauth2-mock-project.iam.gserviceaccount.com",
  "client_id": "100[哈希值]",
  "user_mapping": {
    "client_token": "gemini-client-key-aaaa"
  }
}
\`\`\`
`;

        const instructionPath = path.join(this.outputPath, 'USAGE_INSTRUCTIONS.md');
        fs.writeFileSync(instructionPath, instructions);
        console.log(`✅ 使用说明已保存到: ${instructionPath}`);
        return instructionPath;
    }

    async run() {
        try {
            console.log('🚀 启动映射服务账号密钥生成器');

            const generatedKeys = this.generateKeysForAllUsers();
            const keyMapping = this.createKeyMappingIndex(generatedKeys);
            const instructionPath = this.createUsageInstructions();

            console.log('\n🎉 生成完成！');
            console.log('=====================');
            console.log(`📊 生成统计:`);
            console.log(`- 总用户数: ${keyMapping.total_users}`);
            console.log(`- 密钥文件: ${generatedKeys.length}`);
            console.log(`- 映射索引: key-mapping-index.json`);
            console.log(`- 使用说明: USAGE_INSTRUCTIONS.md`);
            console.log('');
            console.log('📁 输出目录:');
            console.log(`   密钥文件: ${this.outputPath}`);
            console.log(`   映射索引: ${path.join(this.outputPath, 'key-mapping-index.json')}`);
            console.log(`   使用说明: ${path.join(this.outputPath, 'USAGE_INSTRUCTIONS.md')}`);

        } catch (error) {
            console.error('❌ 生成过程中出错:', error.message);
            process.exit(1);
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const generator = new MappedServiceKeyGenerator();
    generator.run();
}

module.exports = MappedServiceKeyGenerator;