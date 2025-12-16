const Redis = require('ioredis');

async function testConnection(hasPassword) {
    const options = {
        host: '127.0.0.1',
        port: 6379,
        retryStrategy: () => null, // 失败不重试，直接报错
        connectTimeout: 2000,
    };

    if (hasPassword) {
        options.password = '123456';
    }

    console.log(`\n正在尝试连接 Redis (${hasPassword ? '密码: 123456' : '无密码'})...`);
    
    const redis = new Redis(options);

    try {
        await new Promise((resolve, reject) => {
            redis.on('connect', () => {
                // 连接成功，尝试发一个 PING
                redis.ping().then((res) => {
                    console.log(`✅ 连接成功！PING 响应: ${res}`);
                    console.log(`💡 结论: 本地 Redis ${hasPassword ? '需要密码 (123456)' : '不需要密码'}`);
                    resolve();
                }).catch(err => {
                    // 如果连接成功但 PING 失败（通常是 NOAUTH）
                    reject(err);
                });
            });

            redis.on('error', (err) => {
                reject(err);
            });
        });
        redis.disconnect();
        return true;
    } catch (err) {
        console.log(`❌ 连接失败: ${err.message}`);
        redis.disconnect();
        return false;
    }
}

async function run() {
    // 1. 先试带密码
    let success = await testConnection(true);
    
    // 2. 如果失败，试无密码
    if (!success) {
        success = await testConnection(false);
    }
    
    if (!success) {
        console.log("\n⚠️  两次尝试都失败了。请检查 Redis 是否已启动，或端口是否为 6379。");
    }
}

run();
