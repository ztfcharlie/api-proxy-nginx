// src/utils/payloads.js

export const VENDOR_OPTIONS = [
    { value: 'openai', label: 'OpenAI (Native)', type: 'header' },
    { value: 'anthropic', label: 'Anthropic (Claude)', type: 'header' },
    { value: 'google-vertex', label: 'Google Vertex AI', type: 'oauth' },
    { value: 'aws-bedrock', label: 'AWS Bedrock', type: 'sigv4' },
    { value: 'azure-openai', label: 'Azure OpenAI', type: 'header' },
    { value: 'deepseek', label: 'DeepSeek', type: 'header' },
    { value: 'qwen', label: 'Aliyun Qwen (OpenAI Compatible)', type: 'header' }
];

export const PATH_SUGGESTIONS = {
    'openai': ['/v1/chat/completions', '/v1/embeddings', '/v1/images/generations'],
    'anthropic': ['/v1/messages', '/v1/complete'],
    'google-vertex': [
        '/v1/projects/{project}/locations/{location}/publishers/google/models/gemini-pro:streamGenerateContent',
        '/v1beta1/projects/{project}/locations/{location}/publishers/google/models/gemini-1.5-flash:generateContent'
    ],
    'aws-bedrock': ['/model/anthropic.claude-v2/invoke', '/model/amazon.titan-text-express-v1/invoke'],
    'azure-openai': ['/openai/deployments/{deployment-id}/chat/completions?api-version=2023-05-15'],
    'deepseek': ['/v1/chat/completions'],
    'qwen': ['/v1/chat/completions']
};

export const PAYLOAD_TEMPLATES = {
    'openai': {
        '/v1/chat/completions': {
            "model": "gpt-3.5-turbo",
            "messages": [
                { "role": "system", "content": "You are a helpful assistant." },
                { "role": "user", "content": "Hello!" }
            ],
            "stream": false
        },
        '/v1/images/generations': {
            "prompt": "A cute baby sea otter",
            "n": 1,
            "size": "1024x1024"
        }
    },
    'anthropic': {
        '/v1/messages': {
            "model": "claude-3-opus-20240229",
            "max_tokens": 1024,
            "messages": [
                {"role": "user", "content": "Hello, world"}
            ]
        }
    },
    'google-vertex': {
        'default': {
            "contents": [
                {
                    "role": "user",
                    "parts": [{ "text": "Write a story about a magic backpack." }]
                }
            ],
            "generationConfig": {
                "maxOutputTokens": 256,
                "temperature": 0.5
            }
        }
    },
    'aws-bedrock': {
        'default': {
            "prompt": "\n\nHuman: Hello!\n\nAssistant:",
            "max_tokens_to_sample": 300,
            "temperature": 0.5,
            "top_p": 1
        }
    },
    'deepseek': {
        '/v1/chat/completions': {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": "You are a helpful assistant"},
                {"role": "user", "content": "Hello"}
            ],
            "stream": false
        }
    },
    'qwen': {
        '/v1/chat/completions': {
            "model": "qwen-turbo",
            "messages": [
                { "role": "system", "content": "You are a helpful assistant." },
                { "role": "user", "content": "你好，通义千问！" }
            ]
        }
    }
};

export const getPayload = (vendor, path) => {
    // 优先匹配具体路径
    if (PAYLOAD_TEMPLATES[vendor] && PAYLOAD_TEMPLATES[vendor][path]) {
        return JSON.stringify(PAYLOAD_TEMPLATES[vendor][path], null, 2);
    }
    // 降级到默认模板
    if (PAYLOAD_TEMPLATES[vendor] && PAYLOAD_TEMPLATES[vendor]['default']) {
        return JSON.stringify(PAYLOAD_TEMPLATES[vendor]['default'], null, 2);
    }
    // 通用默认
    return JSON.stringify({ "message": "No template found, please input manually." }, null, 2);
};
