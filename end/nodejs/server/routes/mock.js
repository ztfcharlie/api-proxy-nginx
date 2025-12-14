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

// --- Shared OpenAI Handler ---
const handleOpenAIRequest = async (req, res) => {
    await sleep(MOCK_DELAY);
    const path = req.path;
    
    // Infer model if missing (e.g. multipart request in mock server without multer)
    let model = req.body.model;
    if (!model) {
        if (path.includes('/video')) model = "sora-2";
        else if (path.includes('/audio')) model = "whisper-1";
        else if (path.includes('/images')) model = "dall-e-3";
        else model = "mock-gpt-4";
    }

    // 1.1 Images
    if (path.includes('/images/') || path.includes('/images')) {
        // Handle edits/variations too (multipart might be parsed as empty body if no multer, but let's return mock)
        return res.json({
            created: Math.floor(Date.now() / 1000),
            data: [
                { url: "https://via.placeholder.com/1024.png?text=Mock+DALL-E+Image" }
            ]
        });
    }

    // 1.2 Embeddings
    if (path.includes('/embeddings')) {
        return res.json({
            object: "list",
            data: [
                {
                    object: "embedding",
                    embedding: Array(1536).fill(0.1), // Mock vector
                    index: 0
                }
            ],
            model: model,
            usage: {
                prompt_tokens: 8,
                total_tokens: 8
            }
        });
    }

    // 1.3 Audio Speech (TTS)
    if (path.includes('/audio/speech')) {
        res.setHeader('Content-Type', 'audio/mpeg');
        return res.send("[MOCK AUDIO DATA]"); 
    }

    // 1.3.1 Audio Transcriptions / Translations (Whisper)
    if (path.includes('/audio/transcriptions') || path.includes('/audio/translations')) {
        return res.json({
            text: "[MOCK Whisper] The quick brown fox jumped over the lazy dog."
        });
    }

    // 1.4 Legacy Completions
    // Note: /chat/completions also contains 'completions', so check for 'chat' exclusion
    if (path.includes('/completions') && !path.includes('/chat')) {
        return res.json({
            id: "cmpl-" + uuidv4(),
            object: "text_completion",
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [
                {
                    text: "[MOCK Legacy] This is a completion response.",
                    index: 0,
                    logprobs: null,
                    finish_reason: "stop"
                }
            ],
            usage: {
                prompt_tokens: 5,
                completion_tokens: 7,
                total_tokens: 12
            }
        });
    }

    // 1.5.1 Video Remix (Sora)
    if (path.includes('/remix')) {
        return res.json({
            id: "vid_" + uuidv4(),
            object: "video",
            model: "sora-2",
            status: "queued",
            created: Math.floor(Date.now() / 1000),
            size: "1280x720",
            seconds: "8", // OpenAI returns string
            remixed_from_video_id: "vid_original_mock"
        });
    }

    // 1.5 Video Generations (Sora)
    if (path.includes('/video/') || path.includes('/videos')) {
        return res.json({
            id: "vid_" + uuidv4(),
            object: "video.generation",
            created: Math.floor(Date.now() / 1000),
            model: model,
            status: "processing", // Simulate Async
            request: {
                prompt: req.body.prompt,
                size: req.body.size
            }
        });
    }
    
    // 1.6 Moderations
    if (path.includes('/moderations')) {
        return res.json({
            id: "modr-" + uuidv4(),
            model: "text-moderation-007",
            results: [
                {
                    flagged: true,
                    categories: {
                        "violence": true,
                    },
                    category_scores: {
                        "violence": 0.99
                    }
                }
            ]
        });
    }

    // 1.7 Responses (New API)
    if (path.includes('/responses')) {
        return res.json({
            id: "resp_" + uuidv4(),
            object: "response",
            created: Math.floor(Date.now() / 1000),
            model: model,
            output: "[MOCK Responses API] This is a simulated response for the new endpoint.",
            usage: {
                input_tokens: 5,
                output_tokens: 10
            }
        });
    }

    // Default: Chat Completions
    const messages = req.body.messages || [];
    const lastUserMsg = messages.reverse().find(m => m.role === 'user')?.content || "";
    
    const response = generateResponse(model, `[MOCK OpenAI] You said: "${lastUserMsg}". This is a simulated response.`);
    
    res.json(response);
};

// --- Route Registration ---
router.post('/openai/*', handleOpenAIRequest);
router.post('/chat/*', handleOpenAIRequest);
router.post('/completions', handleOpenAIRequest);
router.post('/images/*', handleOpenAIRequest);
router.post('/audio/*', handleOpenAIRequest);
router.post('/video/*', handleOpenAIRequest);
router.post('/videos*', handleOpenAIRequest);
router.post('/embeddings', handleOpenAIRequest);
router.post('/moderations', handleOpenAIRequest);
router.post('/responses', handleOpenAIRequest); // [Added]

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
