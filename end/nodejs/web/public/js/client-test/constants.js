(function() {
    // 1KB Silence MP3 (Valid Frame)
    const BASE64_MP3 = "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQZAAP8AAAaQAAAAgAAA0gAAABExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQZAAP8AAAaQAAAAgAAA0gAAABqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

    const VENDOR_OPTIONS = [
        { value: 'openai', label: 'OpenAI (Native)' },
        { value: 'anthropic', label: 'Anthropic (Claude)' },
        { value: 'google-vertex', label: 'Google Vertex AI' },
        { value: 'aws-bedrock', label: 'AWS Bedrock' },
        { value: 'azure-openai', label: 'Azure OpenAI' },
        { value: 'deepseek', label: 'DeepSeek' },
        { value: 'qwen', label: 'Aliyun Qwen' }
    ];

    const PATH_SUGGESTIONS = {
        'openai': [
            '/v1/chat/completions',
            '/v1/completions',
            '/v1/responses', // [Added]
            '/v1/embeddings',
            '/v1/images/generations',
            '/v1/audio/speech',
                    '/v1/audio/transcriptions',
                    '/v1/audio/translations',
                    '/v1/video/generations',
                    '/v1/videos', // New standard path
                    '/v1/images/edits',
                    '/v1/images/variations',                    '/v1/videos/{video_id}/remix',
                    '/v1/videos/{video_id}/content',
                    '/v1/moderations'
                ],
                'anthropic': ['/v1/messages', '/v1/complete'],        'google-vertex': [
            '/v1/projects/{project}/locations/{location}/publishers/google/models/gemini-pro:streamGenerateContent',
            '/v1beta1/projects/{project}/locations/{location}/publishers/google/models/gemini-1.5-flash:generateContent'
        ],
        'aws-bedrock': ['/model/anthropic.claude-v2/invoke'],
        'azure-openai': ['/openai/deployments/{deployment-id}/chat/completions?api-version=2023-05-15'],
        'deepseek': ['/v1/chat/completions'],
        'qwen': ['/v1/chat/completions']
    };

    const PAYLOAD_TEMPLATES = {
        'openai': {
            '/v1/chat/completions': {
                "model": "gpt-3.5-turbo",
                "messages": [
                    { "role": "system", "content": "You are a helpful assistant." },
                    { "role": "user", "content": "Hello!" }
                ],
                "stream": false
            },
            '/v1/completions': {
                "model": "gpt-3.5-turbo-instruct",
                "prompt": "Once upon a time",
                            "max_tokens": 50
                        },
                        '/v1/responses': {
                            "model": "gpt-4o",
                            "input": [
                                { "role": "user", "content": "Hello, this is a test for the new responses endpoint." }
                            ]
                        },
                        '/v1/embeddings': {                "model": "text-embedding-3-small",
                "input": "The food was delicious and the waiter..."
            },
            '/v1/images/generations': {
                "model": "dall-e-3",
                "prompt": "A cute baby sea otter",
                "n": 1,
                "size": "1024x1024"
            },
            '/v1/audio/speech': {
                "model": "tts-1",
                "input": "The quick brown fox jumped over the lazy dog.",
                "voice": "alloy"
            },
            '/v1/audio/transcriptions': {
                "file": "__MOCK_AUDIO__",
                "model": "whisper-1"
            },
                    '/v1/audio/translations': {
                        "file": "__MOCK_AUDIO__",
                        "model": "whisper-1"
                    },
                            '/v1/video/generations': {
                                "model": "sora-2",
                                "prompt": "A stylish woman walks down a Tokyo street...",
                                "size": "1280x720",
                                "seconds": 4
                            },
                            '/v1/videos': {
                                "model": "sora-2",
                                "prompt": "A drone shot of a futuristic city",
                                "size": "1920x1080",
                                "seconds": 4
                            },
                        '/v1/images/edits': {
                            "__FORM_DATA__": true,
                            "image": "__MOCK_AUDIO__", // Reusing base64 file injection for simplicity
                            "prompt": "Add a red hat",
                            "n": 1,
                            "size": "1024x1024"
                        },
                        '/v1/images/variations': {
                            "__FORM_DATA__": true,
                            "image": "__MOCK_AUDIO__", // Using fake file
                            "n": 1,
                            "size": "1024x1024"
                        },
                        '/v1/videos/{video_id}/remix': {
                            "prompt": "Make it in style of 1920s",
                            "duration": 5
                        },
                        '/v1/videos/{video_id}/content': {}, // GET request (No Body)
                        '/v1/moderations': {
                            "input": "I want to kill them."
                        }
                    },
                    'anthropic': {            '/v1/messages': {
                "model": "claude-3-opus-20240229",
                "max_tokens": 1024,
                "messages": [
                    {"role": "user", "content": "Hello, world"}
                ]
            }
        },
        'aws-bedrock': {
            'default': {
                "prompt": "\n\nHuman: Hello!\n\nAssistant:",
                "max_tokens_to_sample": 300
            }
        },
        'google-vertex': {
            'default': {
                "contents": [{ "role": "user", "parts": [{ "text": "Hi" }] }]
            }
        }
    };

    window.ClientTestConstants = {
        BASE64_MP3,
        VENDOR_OPTIONS,
        PATH_SUGGESTIONS,
        PAYLOAD_TEMPLATES
    };
})();