import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';
import ReactJson from 'react-json-view';
import { VENDOR_OPTIONS, PATH_SUGGESTIONS, getPayload } from '../utils/payloads';

const ClientTest = () => {
    // --- State ---
    const [vendor, setVendor] = useState(VENDOR_OPTIONS[0]);
    const [baseUrl, setBaseUrl] = useState('http://localhost:8888'); // 默认代理地址
    const [apiPath, setApiPath] = useState('/v1/chat/completions');
    const [tokenType, setTokenType] = useState('manual'); // 'manual' or 'virtual'
    const [apiKey, setApiKey] = useState('');
    const [virtualTokens, setVirtualTokens] = useState([]);
    const [selectedVirtualToken, setSelectedVirtualToken] = useState(null);
    const [payload, setPayload] = useState(getPayload('openai', '/v1/chat/completions'));
    
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState(null);
    const [error, setError] = useState(null);

    // --- Effects ---
    // 加载 Virtual Tokens
    useEffect(() => {
        axios.get('/api/client-test/tokens')
            .then(res => {
                setVirtualTokens(res.data);
            })
            .catch(err => console.error("Failed to load tokens", err));
    }, []);

    // 当 Vendor 改变时，重置 Path 和 Payload
    useEffect(() => {
        if (!vendor) return;
        const defaultPath = PATH_SUGGESTIONS[vendor.value]?.[0] || '';
        setApiPath(defaultPath);
        setPayload(getPayload(vendor.value, defaultPath));
    }, [vendor]);

    // 当 Path 改变时，更新 Payload
    const handlePathChange = (e) => {
        const newPath = e.target.value;
        setApiPath(newPath);
        // 尝试更新 payload (如果用户没有大幅修改过的话 - 这里简化处理，直接覆盖)
        // 实际体验中，用户可能不喜欢输入一半被覆盖，所以这里仅当用户点击“重置模板”时才覆盖，或者简单处理
        // 为简单起见，这里不自动覆盖，提供一个按钮让用户重置
    };

    const applyTemplate = () => {
        setPayload(getPayload(vendor.value, apiPath));
    };

    // --- Handlers ---
    const handleSubmit = async () => {
        setLoading(true);
        setError(null);
        setResponse(null);

        try {
            // 解析 Payload JSON
            let parsedPayload;
            try {
                parsedPayload = JSON.parse(payload);
            } catch (e) {
                alert("Payload must be valid JSON!");
                setLoading(false);
                return;
            }

            const tokenToSend = tokenType === 'virtual' ? selectedVirtualToken?.value : apiKey;

            if (!tokenToSend) {
                alert("Please provide an API Key or select a Virtual Token");
                setLoading(false);
                return;
            }

            const res = await axios.post('/api/client-test/send', {
                vendor: vendor.value,
                baseUrl,
                path: apiPath,
                apiKey: tokenToSend,
                payload: parsedPayload
            });

            setResponse(res.data);
        } catch (err) {
            setError(err.response?.data || err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">🚀 Client Emulator & Proxy Tester</h1>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Configuration */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-5">
                    <h2 className="text-xl font-semibold border-b pb-2 mb-4 text-gray-700">Request Configuration</h2>

                    {/* Vendor Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Target Vendor</label>
                        <Select 
                            options={VENDOR_OPTIONS} 
                            value={vendor} 
                            onChange={setVendor}
                            className="text-sm"
                        />
                    </div>

                    {/* Base URL */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Proxy Base URL (Your Gateway)</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            placeholder="http://localhost:8888"
                        />
                    </div>

                    {/* Authentication */}
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Authentication</label>
                        <div className="flex space-x-4 mb-3">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    checked={tokenType === 'manual'} 
                                    onChange={() => setTokenType('manual')}
                                />
                                <span className="text-sm">Manual Key / AK:SK</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    checked={tokenType === 'virtual'} 
                                    onChange={() => setTokenType('virtual')}
                                />
                                <span className="text-sm">Virtual Token (Server Managed)</span>
                            </label>
                        </div>

                        {tokenType === 'manual' ? (
                            <input 
                                type="password" 
                                className="w-full p-2 border rounded font-mono text-sm"
                                placeholder={vendor.value === 'aws-bedrock' ? "AK:SK:REGION" : "sk-..."}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                            />
                        ) : (
                            <Select 
                                options={virtualTokens} 
                                value={selectedVirtualToken}
                                onChange={setSelectedVirtualToken}
                                placeholder="Select a virtual token..."
                                className="text-sm"
                            />
                        )}
                    </div>

                    {/* API Path */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium text-gray-700">API Path</label>
                            <button onClick={applyTemplate} className="text-xs text-blue-600 hover:underline">Reset Template</button>
                        </div>
                        <div className="relative">
                            <input 
                                type="text" 
                                list="path-suggestions"
                                className="w-full p-2 border rounded font-mono text-sm text-blue-600"
                                value={apiPath}
                                onChange={handlePathChange}
                            />
                            <datalist id="path-suggestions">
                                {PATH_SUGGESTIONS[vendor.value]?.map(p => (
                                    <option key={p} value={p} />
                                ))}
                            </datalist>
                        </div>
                    </div>

                    {/* Payload Editor */}
                    <div className="flex-1 flex flex-col">
                        <label className="block text-sm font-medium text-gray-700 mb-1">JSON Payload</label>
                        <textarea 
                            className="w-full h-64 p-3 border rounded font-mono text-xs bg-slate-50 focus:bg-white transition-colors resize-none"
                            value={payload}
                            onChange={(e) => setPayload(e.target.value)}
                        />
                    </div>

                    <button 
                        onClick={handleSubmit}
                        disabled={loading}
                        className={`w-full py-3 rounded-lg font-bold text-white shadow-md transition-all ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg'}`}
                    >
                        {loading ? 'Sending Request...' : '🚀 Send Request'}
                    </button>
                </div>

                {/* Right Column: Response */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full">
                    <h2 className="text-xl font-semibold border-b pb-2 mb-4 text-gray-700">Response Console</h2>
                    
                    <div className="flex-1 overflow-auto bg-slate-900 rounded-lg p-4 text-gray-100 font-mono text-xs">
                        {error ? (
                            <div className="text-red-400">
                                <h3 className="font-bold text-lg mb-2">❌ Error</h3>
                                <pre className="whitespace-pre-wrap">{JSON.stringify(error, null, 2)}</pre>
                            </div>
                        ) : response ? (
                            <div>
                                <div className="mb-4 pb-4 border-b border-gray-700">
                                    <span className={`inline-block px-2 py-1 rounded text-xs font-bold mr-2 ${response.status >= 200 && response.status < 300 ? 'bg-green-600' : 'bg-red-600'}`}>
                                        {response.status}
                                    </span>
                                    <span className="text-gray-400">Time: {new Date().toLocaleTimeString()}</span>
                                </div>
                                <h4 className="text-gray-500 mb-2 font-bold uppercase tracking-wider">Headers</h4>
                                <ReactJson 
                                    src={response.headers} 
                                    theme="ocean" 
                                    collapsed={true} 
                                    style={{backgroundColor: 'transparent', fontSize: '11px', marginBottom: '20px'}}
                                />
                                
                                <h4 className="text-gray-500 mb-2 font-bold uppercase tracking-wider">Body</h4>
                                <ReactJson 
                                    src={response.data} 
                                    theme="ocean" 
                                    displayDataTypes={false}
                                    style={{backgroundColor: 'transparent'}} 
                                />
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-600">
                                <p>Ready to capture response...</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientTest;
