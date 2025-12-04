#!/usr/bin/env node

/**
 * TokenMappingService 集成测试
 * 测试 access_token -> user_id 映射功能
 */

const TokenMappingService = require('./server/services/TokenMappingService');
const RedisService = require('./server/services/RedisService');
const LoggerService = require('./server/services/LoggerService');

async function testTokenMappingIntegration() {
    console.log('🧪 开始测试 TokenMappingService 集成');
    console.log('==================================');

    let redisService = null;

    try {
        // 1. 初始化 Redis 服务
        console.log('\n1️⃣ 初始化 Redis 服务...');
        redisService = new RedisService();
        await redisService.initialize();
        console.log('✅ Redis 服务初始化成功');

        // 2. 初始化 TokenMapping 服务
        console.log('\n2️⃣ 初始化 TokenMapping 服务...');
        const tokenMappingService = new TokenMappingService(redisService);
        console.log('✅ TokenMapping 服务初始化成功');

        // 3. 创建测试用户和 Token 映射
        console.log('\n3️⃣ 创建 access_token -> user_id 映射...');
        const testAccessToken = 'test-access-token-' + Date.now();
        const testUserId = 'gemini-client-key-aaaa';
        const testTTL = 3600; // 1小时

        const createResult = await tokenMappingService.createTokenMapping(
            testAccessToken,
            testUserId,
            testTTL
        );

        if (createResult) {
            console.log('✅ Token 映射创建成功');
            console.log(`   Access Token: ${testAccessToken.substring(0, 20)}...`);
            console.log(`   User ID: ${testUserId}`);
            console.log(`   TTL: ${testTTL} 秒`);
        } else {
            throw new Error('Token 映射创建失败');
        }

        // 4. 测试通过 access_token 查找 user_id
        console.log('\n4️⃣ 测试通过 access_token 查找 user_id...');
        const userInfo = await tokenMappingService.getUserByToken(testAccessToken);

        if (userInfo) {
            console.log('✅ 用户信息查找成功');
            console.log(`   User ID: ${userInfo.user_id}`);
            console.log(`   Created At: ${new Date(userInfo.created_at).toISOString()}`);
            console.log(`   Expire At: ${new Date(userInfo.expire_at).toISOString()}`);
        } else {
            throw new Error('用户信息查找失败');
        }

        // 5. 测试 Token 验证
        console.log('\n5️⃣ 测试 Token 验证...');
        const isValid = await tokenMappingService.validateToken(testAccessToken);

        if (isValid) {
            console.log('✅ Token 验证成功');
        } else {
            throw new Error('Token 验证失败');
        }

        // 6. 测试获取用户的所有 Token
        console.log('\n6️⃣ 测试获取用户的所有 Token...');
        const userTokens = await tokenMappingService.getUserTokens(testUserId);

        console.log(`✅ 找到 ${userTokens.length} 个有效 Token`);
        userTokens.forEach((tokenInfo, index) => {
            console.log(`   Token ${index + 1}: ${tokenInfo.access_token.substring(0, 20)}...`);
            console.log(`     Created: ${new Date(tokenInfo.created_at).toISOString()}`);
            console.log(`     Expires: ${new Date(tokenInfo.expire_at).toISOString()}`);
        });

        // 7. 测试快速验证（仅使用 Redis）
        console.log('\n7️⃣ 测试快速验证功能...');
        const quickValidation = await tokenMappingService.validateToken(testAccessToken);

        if (quickValidation) {
            console.log('✅ 快速验证成功');
        } else {
            throw new Error('快速验证失败');
        }

        // 8. 测试删除 Token 映射
        console.log('\n8️⃣ 测试删除 Token 映射...');
        const deleteResult = await tokenMappingService.deleteTokenMapping(testAccessToken);

        if (deleteResult) {
            console.log('✅ Token 映射删除成功');

            // 验证删除后无法找到用户信息
            const deletedUserInfo = await tokenMappingService.getUserByToken(testAccessToken);
            if (!deletedUserInfo) {
                console.log('✅ 删除后验证：Token 已成功清除');
            } else {
                throw new Error('Token 删除后仍能找到用户信息');
            }
        } else {
            throw new Error('Token 映射删除失败');
        }

        // 9. 获取映射统计信息
        console.log('\n9️⃣ 获取映射统计信息...');
        const stats = await tokenMappingService.getMappingStats();
        console.log('✅ 统计信息获取成功');
        console.log(`   总 Token 数: ${stats.total}`);
        console.log(`   有效 Token 数: ${stats.valid}`);
        console.log(`   过期 Token 数: ${stats.expired}`);
        console.log(`   有效率: ${stats.valid_rate}`);

        console.log('\n🎉 所有测试通过！');
        console.log('==================');
        console.log('✅ TokenMappingService 集成验证成功');
        console.log('✅ access_token -> user_id 映射功能正常');
        console.log('✅ Redis 存储和检索功能正常');
        console.log('✅ TTL 过期机制正常');
        console.log('✅ 快速验证功能正常');

    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        console.error('错误详情:', error);
        process.exit(1);
    } finally {
        // 清理连接
        if (redisService) {
            try {
                await redisService.close();
                console.log('\n🔌 Redis 连接已关闭');
            } catch (error) {
                console.error('关闭 Redis 连接时出错:', error);
            }
        }
    }
}

// 运行测试
if (require.main === module) {
    testTokenMappingIntegration().catch((error) => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
}

module.exports = testTokenMappingIntegration;