const { useState, useEffect } = React;
const axios = window.axios;
const { BASE64_MP3, VENDOR_OPTIONS, PATH_SUGGESTIONS, PAYLOAD_TEMPLATES } = window.ClientTestConstants;

const getPayload = (vendor, path) => {
    if (PAYLOAD_TEMPLATES[vendor] && PAYLOAD_TEMPLATES[vendor][path]) {
        return JSON.stringify(PAYLOAD_TEMPLATES[vendor][path], null, 2);
    }
    if (PAYLOAD_TEMPLATES[vendor] && PAYLOAD_TEMPLATES[vendor]['default']) {
        return JSON.stringify(PAYLOAD_TEMPLATES[vendor]['default'], null, 2);
    }
    return JSON.stringify({ "message": "No template found." }, null, 2);
};

const ClientTest = () => {
    const [vendor, setVendor] = useState('openai');
    const [baseUrl, setBaseUrl] = useState(window.location.origin); 
    const [apiPath, setApiPath] = useState('/v1/chat/completions');
    const [tokenType, setTokenType] = useState('manual');
    const [apiKey, setApiKey] = useState('');
    const [virtualTokens, setVirtualTokens] = useState([]);
    const [selectedVirtualTokenId, setSelectedVirtualTokenId] = useState('');
    const [payload, setPayload] = useState(getPayload('openai', '/v1/chat/completions'));
    
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState(null);
    const [error, setError] = useState(null);
    const [notify, setNotify] = useState(null);

    // Load Virtual Tokens
    useEffect(() => {
        if (!axios) return;
        axios.get('/api/client-test/tokens')
            .then(res => setVirtualTokens(res.data))
            .catch(err => console.error("Failed to load tokens", err));
    }, []);

    const handleVendorChange = (newVendor) => {
        setVendor(newVendor);
        const defaultPath = (PATH_SUGGESTIONS[newVendor] && PATH_SUGGESTIONS[newVendor][0]) || '';
        setApiPath(defaultPath);
        setPayload(getPayload(newVendor, defaultPath));
    };

    // When Path is selected from dropdown
    const handlePathSelect = (e) => {
        const path = e.target.value;
        setApiPath(path);
        setPayload(getPayload(vendor, path));
    };

    const handleSubmit = () => {
        setLoading(true);
        setError(null);
        setResponse(null);
        setNotify(null);

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

        // Handle Mock Audio/Form Data
        let requestData = parsedPayload;
        let isMultipart = parsedPayload.__FORM_DATA__ === true;

        if (parsedPayload.file === "__MOCK_AUDIO__") {
            parsedPayload.file = "data:audio/mp3;base64," + BASE64_MP3;
            isMultipart = true; // Auto-enable if mock file found
        }
        if (parsedPayload.audio_file === "__MOCK_AUDIO__") {
            parsedPayload.audio_file = "data:audio/mp3;base64," + BASE64_MP3;
            isMultipart = true;
        }

        // Pass flag to backend if explicit form data
        if (isMultipart && !requestData.__FORM_DATA__) {
             // If we auto-detected base64 but didn't set flag, backend might miss it if we send plain JSON.
             // But wait, the backend logic I wrote scans for "data:" prefix too.
             // So we are good.
        }

        axios.post('/api/client-test/send', {
            vendor,
            baseUrl,
            path: apiPath,
            apiKey: tokenToSend,
            payload: requestData
        })
        .then(res => {
            setResponse(res.data);
            setNotify({ msg: "Request sent successfully!", type: "success" });
        })
        .catch(err => {
            console.error(err);
            const errMsg = (err.response && err.response.data && err.response.data.error) || err.message;
            setError((err.response && err.response.data) || { error: errMsg });
            setNotify({ msg: `Request Failed: ${errMsg}`, type: "error" });
        })
        .finally(() => {
            setLoading(false);
        });
    };

    return (
        <div className="flex flex-col h-full p-6 space-y-4 relative">
            {notify && (
                <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-xl z-50 transition-all duration-300 ${notify.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
                    <div className="flex items-center space-x-2">
                        <i className={`fas ${notify.type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}`}></i>
                        <span className="font-bold">{notify.msg}</span>
                        <button onClick={() => setNotify(null)} className="ml-4 hover:text-gray-200"><i className="fas fa-times"></i></button>
                    </div>
                </div>
            )}
            
            <div className="flex space-x-4 h-full">
                {/* Left Panel: Config */}
                <div className="w-1/2 bg-white rounded-lg shadow-lg p-6 overflow-y-auto custom-scrollbar border border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-3 flex items-center">
                        <i className="fas fa-vial text-blue-500 mr-2"></i>
                        Request Configuration
                    </h2>
                    
                    <div className="mb-5">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Target Vendor</label>
                        <select 
                            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                            value={vendor}
                            onChange={(e) => handleVendorChange(e.target.value)}
                        >
                            {VENDOR_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="mb-5">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Proxy Base URL</label>
                        <input 
                            type="text" 
                            className="w-full p-2.5 border border-gray-300 rounded-md font-mono text-sm bg-gray-50 focus:bg-white"
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            placeholder="http://localhost:8888"
                        />
                    </div>

                    <div className="mb-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <label className="block text-sm font-bold text-gray-700 mb-3">Authentication</label>
                        <div className="flex space-x-6 mb-3 text-sm">
                            <label className="flex items-center cursor-pointer hover:text-blue-600">
                                <input type="radio" name="authType" className="mr-2 accent-blue-600"
                                    checked={tokenType === 'manual'} onChange={() => setTokenType('manual')} />
                                Manual Key
                            </label>
                            <label className="flex items-center cursor-pointer hover:text-blue-600">
                                <input type="radio" name="authType" className="mr-2 accent-blue-600"
                                    checked={tokenType === 'virtual'} onChange={() => setTokenType('virtual')} />
                                Virtual Token
                            </label>
                        </div>

                        {tokenType === 'manual' ? (
                            <input 
                                type="password" 
                                className="w-full p-2.5 border border-gray-300 rounded-md font-mono text-sm"
                                placeholder={vendor === 'aws-bedrock' ? "AK:SK:Region" : "sk-..."}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                            />
                        ) : (
                            <select 
                                className="w-full p-2.5 border border-gray-300 rounded-md text-sm bg-white"
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

                    <div className="mb-5">
                        <label className="block text-sm font-bold text-gray-700 mb-2">API Path</label>
                        <div className="flex relative">
                            {/* Editable Input */}
                            <input 
                                type="text" 
                                className="flex-1 p-2.5 border border-gray-300 rounded-l-md font-mono text-sm text-blue-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                value={apiPath}
                                onChange={(e) => setApiPath(e.target.value)}
                            />
                            {/* Dropdown Trigger */}
                            <div className="relative w-10">
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 border-y border-r border-gray-300 rounded-r-md pointer-events-none text-gray-500">
                                    <i className="fas fa-chevron-down"></i>
                                </div>
                                <select 
                                    className="w-full h-full opacity-0 cursor-pointer absolute inset-0 z-10"
                                    onChange={handlePathSelect}
                                    value=""
                                    title="Quick Select Path"
                                >
                                    <option value="" disabled>Select Endpoint...</option>
                                    {(PATH_SUGGESTIONS[vendor] || []).map(p => (
                                        <option key={p} value={p} className="text-gray-800 bg-white py-1">
                                            {p}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        
                        <div className="mt-2 flex flex-wrap gap-2">
                            {(PATH_SUGGESTIONS[vendor] || []).slice(0, 4).map(p => (
                                <button key={p} onClick={() => handlePathSelect({target: {value: p}})} 
                                    className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 border border-blue-100 truncate max-w-[150px]">
                                    {p.split('/').pop()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col">
                        <label className="block text-sm font-bold text-gray-700 mb-2">JSON Payload</label>
                        {(apiPath.includes('/audio/') || apiPath.includes('/images/edits') || apiPath.includes('/video/')) && (
                            <div className="bg-blue-50 text-blue-700 text-xs p-2 rounded mb-2 border border-blue-100">
                                <i className="fas fa-info-circle mr-1"></i>
                                <strong>Multipart Mode:</strong> This JSON will be converted to <code>multipart/form-data</code>. 
                                Use <code>"__MOCK_AUDIO__"</code> for file fields.
                            </div>
                        )}
                        <textarea 
                            className="w-full h-64 p-3 border border-gray-300 rounded-md font-mono text-xs bg-gray-50 focus:bg-white resize-none"
                            value={payload}
                            onChange={(e) => setPayload(e.target.value)}
                        />
                    </div>

                    <button 
                        onClick={handleSubmit}
                        disabled={loading}
                        className={`mt-6 w-full py-3 px-4 rounded-md text-white font-bold text-lg shadow-md transition-all transform hover:-translate-y-0.5 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'}`}
                    >
                        {loading ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-paper-plane mr-2"></i>}
                        {loading ? 'Processing...' : 'Send Request'}
                    </button>
                </div>

                {/* Right Panel: Response */}
                <div className="w-1/2 bg-white rounded-lg shadow-lg p-6 flex flex-col h-full overflow-hidden border border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-3 flex items-center">
                        <i className="fas fa-terminal text-green-500 mr-2"></i>
                        Response Console
                    </h2>
                    
                    <div className="flex-1 overflow-auto bg-gray-900 rounded-lg p-5 text-green-400 font-mono text-xs custom-scrollbar">
                        {error ? (
                            <div className="text-red-400">
                                <div className="font-bold border-b border-red-800 pb-2 mb-2 text-lg">❌ REQUEST FAILED</div>
                                <pre className="whitespace-pre-wrap">{JSON.stringify(error, null, 2)}</pre>
                            </div>
                        ) : response ? (
                            <div>
                                <div className="mb-4 pb-2 border-b border-gray-700 flex justify-between items-center">
                                    <span className={`px-2 py-1 rounded text-sm font-bold ${response.status < 300 ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
                                        Status: {response.status}
                                    </span>
                                    <span className="text-gray-500 text-xs">{new Date().toLocaleTimeString()}</span>
                                </div>
                                <div className="text-gray-500 mb-1 font-bold uppercase">Response Headers:</div>
                                <pre className="text-gray-400 mb-6 whitespace-pre-wrap">{JSON.stringify(response.headers, null, 2)}</pre>
                                <div className="text-gray-500 mb-1 font-bold uppercase">Response Body:</div>
                                <pre className="whitespace-pre-wrap text-white">{JSON.stringify(response.data, null, 2)}</pre>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4">
                                <i className="fas fa-satellite-dish text-5xl opacity-20"></i>
                                <p className="italic">Waiting for request transmission...</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ClientTest />);
