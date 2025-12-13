// Payload Templates & Constants
const BASE64_MP3 = "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWgAAAA0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

const CLIENT_TEST_CONSTANTS = {
    VENDOR_OPTIONS: [
        { value: 'openai', label: 'OpenAI (Native)' },
        { value: 'anthropic', label: 'Anthropic (Claude)' },
        { value: 'google-vertex', label: 'Google Vertex AI' },
        { value: 'aws-bedrock', label: 'AWS Bedrock' },
        { value: 'azure-openai', label: 'Azure OpenAI' },
        { value: 'deepseek', label: 'DeepSeek' },
        { value: 'qwen', label: 'Aliyun Qwen' }
    ],

    PATH_SUGGESTIONS: {
        'openai': [
            '/v1/chat/completions', 
            '/v1/completions',
            '/v1/embeddings',
            '/v1/images/generations',
            '/v1/audio/speech',
            '/v1/audio/transcriptions',
            '/v1/audio/translations',
            '/v1/video/generations', // Sora
            '/v1/moderations'
        ],
        'anthropic': ['/v1/messages', '/v1/complete'],
        'google-vertex': [
            '/v1/projects/{project}/locations/{location}/publishers/google/models/gemini-pro:streamGenerateContent'
        ],
        'aws-bedrock': ['/model/anthropic.claude-v2/invoke'],
        'azure-openai': ['/openai/deployments/{deployment-id}/chat/completions?api-version=2023-05-15'],
        'deepseek': ['/v1/chat/completions'],
        'qwen': ['/v1/chat/completions']
    },

    PAYLOAD_TEMPLATES: {
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
            '/v1/embeddings': {
                "model": "text-embedding-3-small",
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
            '/v1/video/generations': {
                "model": "sora-1.0",
                "prompt": "A stylish woman walks down a Tokyo street...",
                "size": "1920x1080"
            },
            '/v1/moderations': {
                "input": "I want to kill them."
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
    }
};

const getTestPayload = (vendor, path) => {
    const templates = CLIENT_TEST_CONSTANTS.PAYLOAD_TEMPLATES;
    if (templates[vendor] && templates[vendor][path]) {
        return JSON.stringify(templates[vendor][path], null, 2);
    }
    if (templates[vendor] && templates[vendor]['default']) {
        return JSON.stringify(templates[vendor]['default'], null, 2);
    }
    return JSON.stringify({ "message": "No template found." }, null, 2);
};

window.ClientTest = ({ setNotify }) => {
    const { useState, useEffect } = window.React;
    const axios = window.axios;

    const [vendor, setVendor] = useState('openai');
    const [baseUrl, setBaseUrl] = useState(window.location.origin); 
    const [apiPath, setApiPath] = useState('/v1/chat/completions');
    const [tokenType, setTokenType] = useState('manual');
    const [apiKey, setApiKey] = useState('');
    const [virtualTokens, setVirtualTokens] = useState([]);
    const [selectedVirtualTokenId, setSelectedVirtualTokenId] = useState('');
    const [payload, setPayload] = useState(getTestPayload('openai', '/v1/chat/completions'));
    
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!axios) return;
        axios.get('/api/client-test/tokens')
            .then(res => setVirtualTokens(res.data))
            .catch(err => console.error("Failed to load tokens", err));
    }, []);

    const handleVendorChange = (newVendor) => {
        setVendor(newVendor);
        const defaultPath = CLIENT_TEST_CONSTANTS.PATH_SUGGESTIONS[newVendor]?.[0] || '';
        setApiPath(defaultPath);
        setPayload(getTestPayload(newVendor, defaultPath));
    };

    const handleSubmit = () => {
        setLoading(true);
        setError(null);
        setResponse(null);

        let parsedPayload;
        try {
            parsedPayload = JSON.parse(payload);
        } catch (e) {
            if(setNotify) setNotify({ msg: "Payload must be valid JSON", type: "error" });
            setLoading(false);
            return;
        }

        const tokenToSend = tokenType === 'virtual' ? selectedVirtualTokenId : apiKey;

        if (!tokenToSend) {
            if(setNotify) setNotify({ msg: "Please provide an API Key or select a Virtual Token", type: "warning" });
            setLoading(false);
            return;
        }

        // Handle Magic string for audio
        if (parsedPayload.file === "__MOCK_AUDIO__") {
            parsedPayload.file = "data:audio/mp3;base64," + BASE64_MP3;
        }

        axios.post('/api/client-test/send', {
            vendor,
            baseUrl,
            path: apiPath,
            apiKey: tokenToSend,
            payload: parsedPayload
        })
        .then(res => {
            setResponse(res.data);
            if(setNotify) setNotify({ msg: "Request sent successfully!", type: "success" });
        })
        .catch(err => {
            console.error(err);
            const errMsg = (err.response && err.response.data && err.response.data.error) || err.message;
            setError((err.response && err.response.data) || { error: errMsg });
            if(setNotify) setNotify({ msg: `Request Failed: ${errMsg}`, type: "error" });
        })
        .finally(() => {
            setLoading(false);
        });
    };

    return (
        <div className="flex flex-col h-full p-6 space-y-4 relative">
            {notify && ( // Assuming notify comes from props, wait, the prop is setNotify. 
                         // The parent handles rendering notifications? 
                         // No, ClientTest component usually renders its own notifications or uses parent's.
                         // In app.js, <window.Notification ... /> is rendered by App. 
                         // So we don't need to render notify here.
                         // BUT, in the previous iframe version, we implemented local notify state.
                         // Let's check 'client-test.html'. Yes, it has local 'notify' state.
                         // Wait, this file is 'js/client-test.js', which is NOT used by 'client-test.html'.
                         // 'client-test.html' has INLINE script.
                         // OH NO! I am modifying the WRONG FILE.
                         // I should modify 'nodejs/web/public/client-test.html'.
                         // 'js/client-test.js' was the one we abandoned when switching to Iframe.
                null
            )}
            {/* ... */}
        </div>
    );
};
// ...