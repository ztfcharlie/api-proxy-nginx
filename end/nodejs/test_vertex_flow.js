const mysql = require('mysql2/promise');
const forge = require('node-forge');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const DB_CONFIG = {
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'ai_proxy'
};

const GATEWAY_URL = 'http://localhost:8080/oauth2.googleapis.com/token';

async function generateKeyPair() {
    return new Promise((resolve, reject) => {
        forge.pki.rsa.generateKeyPair({ bits: 2048, workers: -1 }, (err, keypair) => {
            if (err) return reject(err);
            resolve({
                privateKey: forge.pki.privateKeyToPem(keypair.privateKey),
                publicKey: forge.pki.publicKeyToPem(keypair.publicKey)
            });
        });
    });
}

async function run() {
    const conn = await mysql.createConnection(DB_CONFIG);
    let tokenId = null;

    try {
        console.log("1. Generating RSA Key Pair...");
        const keys = await generateKeyPair();

        console.log("2. Inserting Test Token into DB...");
        const [users] = await conn.query("SELECT id FROM sys_users LIMIT 1");
        if (users.length === 0) {
            throw new Error("No users found in DB. Please init DB first.");
        }
        const userId = users[0].id;

        const tokenKey = `service-account-test-${uuidv4().substring(0,8)}@test.com`;
        
        const [res] = await conn.query(
            "INSERT INTO sys_virtual_tokens (user_id, name, type, token_key, token_secret, public_key, status) VALUES (?, ?, 'vertex', ?, ?, ?, 1)",
            [userId, 'AutoTestToken', tokenKey, keys.privateKey, keys.publicKey]
        );
        tokenId = res.insertId;
        console.log(`   -> Token Created (ID: ${tokenId})`);

        console.log("3. Generating JWT (Client Side Simulation)...");
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: tokenKey,
            scope: "https://www.googleapis.com/auth/cloud-platform",
            aud: GATEWAY_URL,
            exp: now + 3600,
            iat: now
        };
        
        const assertion = jwt.sign(payload, keys.privateKey, { algorithm: 'RS256' });

        console.log("4. Sending Request to Go Gateway...");
        try {
            const response = await axios.post(GATEWAY_URL, 
                new URLSearchParams({
                    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    assertion: assertion
                }), 
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            console.log("\n✅ RESPONSE RECEIVED:");
            console.log(JSON.stringify(response.data, null, 2));

            const accessToken = response.data.access_token;
            if (accessToken && accessToken.startsWith('yo39.virtual')) {
                console.log("\n🎉 SUCCESS: Access Token starts with 'yo39.virtual'");
            } else {
                console.log("\n❌ FAILURE: Token format invalid");
                process.exitCode = 1;
            }

        } catch (err) {
            console.error("\n❌ REQUEST FAILED:", err.response ? err.response.data : err.message);
            process.exitCode = 1;
        }

    } catch (err) {
        console.error("Critical Error:", err);
    } finally {
        if (tokenId) {
            console.log("\n5. Cleaning up...");
            await conn.query("DELETE FROM sys_virtual_tokens WHERE id = ?", [tokenId]);
            console.log("   -> Test token deleted.");
        }
        await conn.end();
    }
}

run();
