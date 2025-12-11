// Payload Templates & Constants
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
    'openai': ['/v1/chat/completions', '/v1/embeddings'],
    'anthropic': ['/v1/messages', '/v1/complete'],
    'google-vertex': [
        '/v1/projects/{project}/locations/{location}/publishers/google/models/gemini-pro:streamGenerateContent'
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
};

const getPayload = (vendor, path) => {
    if (PAYLOAD_TEMPLATES[vendor] && PAYLOAD_TEMPLATES[vendor][path]) {
        return JSON.stringify(PAYLOAD_TEMPLATES[vendor][path], null, 2);
    }
    if (PAYLOAD_TEMPLATES[vendor] && PAYLOAD_TEMPLATES[vendor]['default']) {
        return JSON.stringify(PAYLOAD_TEMPLATES[vendor]['default'], null, 2);
    }
    return JSON.stringify({ "message": "No template found." }, null, 2);
};

// Component Definition
window.ClientTest = ({ setNotify }) => {
    const { useState, useEffect } = React;

    const [vendor, setVendor] = useState('openai');
    const [baseUrl, setBaseUrl] = useState(window.location.origin); // Default to current host
    const [apiPath, setApiPath] = useState('/v1/chat/completions');
    const [tokenType, setTokenType] = useState('manual');
    const [apiKey, setApiKey] = useState('');
    const [virtualTokens, setVirtualTokens] = useState([]);
    const [selectedVirtualTokenId, setSelectedVirtualTokenId] = useState('');
    const [payload, setPayload] = useState(getPayload('openai', '/v1/chat/completions'));
    
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState(null);
    const [error, setError] = useState(null);

    // Load Virtual Tokens
    useEffect(() => {
        axios.get('/api/client-test/tokens')
            .then(res => setVirtualTokens(res.data))
            .catch(err => console.error("Failed to load tokens", err));
    }, []);

    // Handle Vendor Change
    const handleVendorChange = (newVendor) => {
        setVendor(newVendor);
        const defaultPath = PATH_SUGGESTIONS[newVendor]?.[0] || '';
        setApiPath(defaultPath);
        setPayload(getPayload(newVendor, defaultPath));
    };

    // Submit Request
    const handleSubmit = async () => {
        setLoading(true);
        setError(null);
        setResponse(null);

        try {
            let parsedPayload;
            try {
                parsedPayload = JSON.parse(payload);
            } catch (e) {
                setNotify({ msg: "Payload must be valid JSON", type: "error" });
                setLoading(false);
                return;
            }

            const tokenToSend = tokenType === 'virtual' ? selectedVirtualTokenId : apiKey;

            if (!tokenToSend) {
                setNotify({ msg: "Please provide an API Key or select a Virtual Token", type: "warning" });
                setLoading(false);
                return;
            }

            const res = await axios.post('/api/client-test/send', {
                vendor,
                baseUrl,
                path: apiPath,
                apiKey: tokenToSend, // This handles both raw key and virtual token ID (string)
                payload: parsedPayload
            });

            setResponse(res.data);
            setNotify({ msg: "Request sent successfully!", type: "success" });
        } catch (err) {
            console.error(err);
            const errMsg = err.response?.data?.error || err.message;
            setError(err.response?.data || { error: errMsg });
            setNotify({ msg: `Request Failed: ${errMsg}`, type: "error" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex space-x-4 h-full">
                {/* Left Panel: Config */}
                <div className="w-1/2 bg-white rounded-lg shadow p-6 overflow-y-auto">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Request Config</h2>
                    
                    {/* Vendor */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Target Vendor</label>
                        <select 
                            className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            value={vendor}
                            onChange={(e) => handleVendorChange(e.target.value)}
                        >
                            {VENDOR_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Base URL */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Proxy Base URL</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-300 rounded font-mono text-sm"
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            placeholder="http://localhost:8888"
                        />
                    </div>

                    {/* Auth */}
                    <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Authentication</label>
                        <div className="flex space-x-4 mb-2 text-sm">
                            <label className="flex items-center cursor-pointer">
                                <input type="radio" name="authType" className="mr-2"
                                    checked={tokenType === 'manual'} onChange={() => setTokenType('manual')} />
                                Manual Key
                            </label>
                            <label className="flex items-center cursor-pointer">
                                <input type="radio" name="authType" className="mr-2"
                                    checked={tokenType === 'virtual'} onChange={() => setTokenType('virtual')} />
                                Virtual Token
                            </label>
                        </div>

                        {tokenType === 'manual' ? (
                            <input 
                                type="password" 
                                className="w-full p-2 border border-gray-300 rounded font-mono text-sm"
                                placeholder={vendor === 'aws-bedrock' ? "AK:SK:Region" : "sk-..."}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                            />
                        ) : (
                            <select 
                                className="w-full p-2 border border-gray-300 rounded text-sm"
                                value={selectedVirtualTokenId}
                                onChange={(e) => setSelectedVirtualTokenId(e.target.value)}
                            >
                                <option value="">-- Select Virtual Token --</option>
                                {virtualTokens.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Path */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">API Path</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-300 rounded font-mono text-sm text-blue-600"
                            value={apiPath}
                            onChange={(e) => setApiPath(e.target.value)}
                            list="path-list"
                        />
                        <datalist id="path-list">
                            {(PATH_SUGGESTIONS[vendor] || []).map(p => <option key={p} value={p} />)}
                        </datalist>
                    </div>

                    {/* Payload */}
                    <div className="flex-1 flex flex-col">
                        <label className="block text-sm font-medium text-gray-700 mb-1">JSON Payload</label>
                        <textarea 
                            className="w-full h-48 p-2 border border-gray-300 rounded font-mono text-xs bg-gray-50"
                            value={payload}
                            onChange={(e) => setPayload(e.target.value)}
                        />
                    </div>

                    <button 
                        onClick={handleSubmit}
                        disabled={loading}
                        className={`mt-4 w-full py-2 px-4 rounded text-white font-bold transition-colors ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {loading ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-paper-plane mr-2"></i>}
                        {loading ? 'Sending...' : 'Send Request'}
                    </button>
                </div>

                {/* Right Panel: Response */}
                <div className="w-1/2 bg-white rounded-lg shadow p-6 flex flex-col h-full overflow-hidden">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Response</h2>
                    
                    <div className="flex-1 overflow-auto bg-gray-900 rounded p-4 text-green-400 font-mono text-xs">
                        {error ? (
                            <div className="text-red-400">
                                <div className="font-bold border-b border-red-800 pb-2 mb-2">ERROR</div>
                                <pre className="whitespace-pre-wrap">{JSON.stringify(error, null, 2)}</pre>
                            </div>
                        ) : response ? (
                            <div>
                                <div className="mb-2 pb-2 border-b border-gray-700 flex justify-between">
                                    <span className={response.status < 300 ? "text-green-400" : "text-red-400"}>
                                        Status: {response.status}
                                    </span>
                                    <span className="text-gray-500">{new Date().toLocaleTimeString()}</span>
                                </div>
                                <div className="text-gray-500 mb-1">HEADERS:</div>
                                <pre className="text-gray-400 mb-4 whitespace-pre-wrap">{JSON.stringify(response.headers, null, 2)}</pre>
                                <div className="text-gray-500 mb-1">BODY:</div>
                                <pre className="whitespace-pre-wrap text-white">{JSON.stringify(response.data, null, 2)}</pre>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-600 italic">
                                Ready to send request...
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
