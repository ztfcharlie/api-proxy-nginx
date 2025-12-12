const Redis = require('ioredis');

const config = {
    host: 'api-proxy-redis', // 在容器内运行时用这个
    port: 6379,
    password: process.env.REDIS_PASSWORD || '123456'
};

// 如果是在宿主机运行，host 改为 localhost，端口改为映射端口
if (process.env.LOCAL_TEST) {
    config.host = '127.0.0.1';
    config.port = 6379; // 假设映射了
}

console.log("Connecting to Redis with config:", JSON.stringify(config));

const pub = new Redis(config);
const sub = new Redis(config);

sub.subscribe('sys:log_stream', (err, count) => {
    if (err) console.error("Subscribe Error:", err);
    else console.log(`Subscribed! Count: ${count}`);
    
    // Test Publish
    console.log("Publishing test message...");
    pub.publish('sys:log_stream', JSON.stringify({msg: "Hello from debugger"}));
});

sub.on('message', (channel, message) => {
    console.log(`Received message on ${channel}: ${message}`);
    process.exit(0);
});

// Timeout
setTimeout(() => {
    console.log("Timeout! No message received.");
    process.exit(1);
}, 5000);
