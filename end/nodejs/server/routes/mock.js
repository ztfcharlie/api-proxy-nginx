const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 模拟延迟 (毫秒)，让测试更真实
const MOCK_DELAY = 500;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 通用响应生成器
 */
const generateResponse = (model, content) => {
    return {
        id: "chatcmpl-" + uuidv4(),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
            index: 0,
            message: {
                role: "assistant",
                content: content || "This is a MOCK response from the API Proxy local environment. I am functioning correctly!"
            },
            finish_reason: "stop"
        }],
        usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
        }
    };
};

// --- 1. OpenAI / DeepSeek / Qwen / Azure Mock ---
// Path: /mock/openai/v1/chat/completions
router.post('/openai/*', async (req, res) => {
    await sleep(MOCK_DELAY);
    const model = req.body.model || "mock-gpt-4";
    const messages = req.body.messages || [];
    const lastUserMsg = messages.reverse().find(m => m.role === 'user')?.content || "";
    
    const response = generateResponse(model, `[MOCK OpenAI] You said: "${lastUserMsg}". This is a simulated response.`);
    
    res.json(response);
});

// --- 1.1 Support direct /chat/completions (for Nginx /v1 forwarding) ---
router.post('/chat/completions', async (req, res) => {
    await sleep(MOCK_DELAY);
    const model = req.body.model || "mock-gpt-4";
    const messages = req.body.messages || [];
    const lastUserMsg = messages.reverse().find(m => m.role === 'user')?.content || "";
    
    const response = generateResponse(model, `[MOCK Direct] You said: "${lastUserMsg}". This is a simulated response from /v1/chat/completions.`);
    
    res.json(response);
});

// --- 2. Anthropic Mock ---
// Path: /mock/anthropic/v1/messages
router.post('/anthropic/*', async (req, res) => {
    await sleep(MOCK_DELAY);
    const model = req.body.model || "mock-claude-3";
    
    res.json({
        id: "msg_" + uuidv4(),
        type: "message",
        role: "assistant",
        content: [
            {
                type: "text",
                text: "[MOCK Anthropic] This is a simulated Claude response."
            }
        ],
        model: model,
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
            input_tokens: 15,
            output_tokens: 25
        }
    });
});

// --- 3. Google Vertex AI Mock ---
// Path: /mock/vertex/v1/projects/...
// Vertex 的路径比较复杂，通常是 /v1/projects/{project}/locations/{location}/publishers/google/models/{model}:predict
router.post('/vertex/*', async (req, res) => {
    await sleep(MOCK_DELAY);
    
    // Vertex 的响应格式比较特殊
    res.json({
        predictions: [
            {
                candidates: [
                    {
                        content: {
                            role: "model",
                            parts: [
                                {
                                    text: "[MOCK Vertex] This is a simulated Gemini response."
                                }
                            ]
                        },
                        finishReason: "STOP",
                        safetyRatings: [
                            {
                                category: "HARM_CATEGORY_HATE_SPEECH",
                                probability: "NEGLIGIBLE"
                            }
                        ]
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 10,
                    candidatesTokenCount: 20,
                    totalTokenCount: 30
                }
            }
        ]
    });
});

// --- 4. AWS Bedrock Mock ---
// Path: /mock/bedrock/model/...
router.post('/bedrock/*', async (req, res) => {
    await sleep(MOCK_DELAY);
    // Claude on Bedrock format
    res.json({
        completion: " [MOCK Bedrock] Simulated response.",
        stop_reason: "stop_sequence",
        stop: "\n\nHuman:"
    });
});

// --- 5. Google OAuth2 Token Mock ---
// Path: /mock/oauth2/token
// 用于让 Go 服务来这里换取 Token，而不是去真的 Google
router.post('/oauth2/token', async (req, res) => {
    await sleep(200); // 模拟网络延迟
    
    const grantType = req.body.grant_type;
    const assertion = req.body.assertion;
    
    if (grantType !== 'urn:ietf:params:oauth:grant-type:jwt-bearer') {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid grant_type' });
    }
    
    if (!assertion) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing assertion' });
    }

    // 这里简单返回一个模拟 Token
    // 格式：ya29.mock_token_UUID
    res.json({
        access_token: "ya29.mock_token_" + uuidv4(),
        expires_in: 3600,
        token_type: "Bearer"
    });
});

module.exports = router;
