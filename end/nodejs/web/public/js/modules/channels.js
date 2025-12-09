const { useState, useEffect } = React;
const axios = window.axios;

// --- Sub-Components (Defined outside to prevent re-renders) ---

const ChannelForm = ({ channel, onSubmit, onCancel }) => {
    const [type, setType] = useState(channel?.type || 'openai');
    const extra = channel?.extra_config ? (typeof channel.extra_config === 'string' ? JSON.parse(channel.extra_config) : channel.extra_config) : {};

    // Update local type state when channel changes
    useEffect(() => {
        if (channel) setType(channel.type);
        else setType('openai');
    }, [channel]);

    const handleTestConnection = async () => {
        // Collect data from form manually since state might not be fully sync
        const form = document.getElementById('channelForm');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Prepare payload
        const payload = {
            type: data.type,
            credentials: data.credentials_input || (channel ? channel.credentials : ''),
            extra_config: {}
        };

        if (data.type === 'azure') {
            payload.extra_config = { endpoint: data.azure_endpoint, api_version: data.azure_api_version };
        }
        // Vertex credentials handling
        if (data.type === 'vertex' && payload.credentials) {
             // Try to parse if it's a string, backend expects object or string but let's send what we have
        }

        try {
            const res = await window.api.channels.testConnection(payload);
            if (res.data.success) {
                alert('✅ ' + res.data.message);
            } else {
                alert('❌ Test Failed: ' + res.data.message);
            }
        } catch (e) {
            alert('❌ Error: ' + (e.response?.data?.error || e.message));
        }
    };

    return (
        <form id="channelForm" onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input name="name" defaultValue={channel?.name} required className="w-full border rounded-lg px-3 py-2" placeholder="My Channel" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="w-full border rounded-lg px-3 py-2 bg-white">
                        <option value="openai">OpenAI</option>
                        <option value="azure">Azure OpenAI</option>
                        <option value="vertex">Google Vertex AI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="aws_bedrock">AWS Bedrock</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="qwen">Qwen (Aliyun)</option>
                    </select>
                </div>
            </div>

            {type !== 'aws_bedrock' && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        {type === 'vertex' ? 'Service Account JSON' : 'API Key'}
                        {channel && <span className="text-gray-400 font-normal ml-2 text-xs">(Leave blank to keep unchanged)</span>}
                    </label>
                    <textarea name="credentials_input" rows={type === 'vertex' ? 5 : 2} 
                        required={!channel}
                        defaultValue=""
                        className="w-full border rounded-lg px-3 py-2 font-mono text-xs bg-gray-50" 
                        placeholder={channel ? "••••••••" : (type === 'vertex' ? '{ "type": "service_account", ... }' : 'sk-...')} />
                    <div className="mt-2 text-right">
                        <button type="button" onClick={handleTestConnection} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded border transition-colors">
                            <i className="fas fa-plug mr-1"></i> Test Credentials
                        </button>
                    </div>
                </div>
            )}

            {type === 'azure' && (
                <div className="grid grid-cols-2 gap-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="col-span-2 text-xs font-bold text-blue-600 uppercase mb-1">Azure Configuration</div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Endpoint URL</label>
                        <input name="azure_endpoint" defaultValue={extra.endpoint} required placeholder="https://xxx.openai.azure.com" className="w-full border rounded px-2 py-1 text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">API Version</label>
                        <input name="azure_api_version" defaultValue={extra.api_version || '2023-05-15'} required className="w-full border rounded px-2 py-1 text-sm" />
                    </div>
                </div>
            )}

            {type === 'aws_bedrock' && (
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 space-y-3">
                    <div className="text-xs font-bold text-orange-600 uppercase">AWS Configuration</div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Region</label>
                            <input name="aws_region" defaultValue={extra.region || 'us-east-1'} required className="w-full border rounded px-2 py-1 text-sm" />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Access Key ID</label>
                            <input name="aws_ak" defaultValue={extra.access_key_id} required className="w-full border rounded px-2 py-1 text-sm" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Secret Access Key</label>
                        <input name="aws_sk" type="password" defaultValue={extra.secret_access_key} required className="w-full border rounded px-2 py-1 text-sm" />
                    </div>
                </div>
            )}

            {channel && (
                <div className="flex items-center space-x-2 pt-2">
                    <input type="checkbox" name="status" id="statusCheck" 
                        defaultChecked={channel.status === 1} 
                        className="w-4 h-4 text-blue-600 rounded" />
                    <label htmlFor="statusCheck" className="text-sm font-medium text-gray-700">Channel Active</label>
                </div>
            )}
            
            <div className="px-0 py-4 mt-4 border-t flex justify-end gap-3">
                <button type="button" onClick={onCancel} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Changes</button>
            </div>
        </form>
    );
};

const ModelConfigForm = ({ channel, allModels, onSubmit, onCancel }) => {
    const [enabledModels, setEnabledModels] = useState([]);
    const [filteredAvailable, setFilteredAvailable] = useState([]);
    const [testingModel, setTestingModel] = useState(null);

    useEffect(() => {
        if (!allModels) return;
        let initialConfig = {};
        try {
            initialConfig = (typeof channel.models_config === 'string') ? JSON.parse(channel.models_config) : (channel.models_config || {});
        } catch (e) {}

        const selected = [];
        const available = [];

        allModels.forEach(m => {
            // Compatibility Check
            let providers = [];
            try {
                const parsed = JSON.parse(m.provider || "[]");
                if (Array.isArray(parsed)) providers = parsed;
                else providers = [m.provider];
            } catch (e) {
                providers = [m.provider]; // Legacy string
            }

            let isCompatible = false;
            if (providers.length === 0) isCompatible = true; 
            else if (providers.includes(channel.type)) isCompatible = true;
            else if (channel.type === 'azure' && providers.includes('openai')) isCompatible = true;
            else if (channel.type === 'aws_bedrock' && (providers.includes('anthropic') || providers.includes('aws'))) isCompatible = true;
            else if (channel.type === 'vertex' && providers.includes('google')) isCompatible = true;
            
            const configEntry = initialConfig[m.name];
            
            if (configEntry !== undefined) {
                let conf = { name: m.name, mapTo: '', rpm: '', mode: 'token' };
                if (typeof configEntry === 'string') {
                    conf.mapTo = configEntry;
                } else if (typeof configEntry === 'object' && configEntry !== null) {
                    conf = { ...conf, ...configEntry };
                }
                selected.push(conf);
            } else if (isCompatible) {
                available.push(m);
            }
        });
        
        setEnabledModels(selected);
        setFilteredAvailable(available);
    }, [allModels, channel]);

    const addModel = (model) => {
        const defaultRpm = model.default_rpm || 5000;
        setEnabledModels([...enabledModels, { name: model.name, mapTo: '', rpm: defaultRpm, mode: 'token' }]);
        setFilteredAvailable(filteredAvailable.filter(m => m.name !== model.name));
    };

    const removeModel = (modelName) => {
        const modelInfo = allModels.find(m => m.name === modelName);
        if (modelInfo) {
            let providers = [];
            try {
                const parsed = JSON.parse(modelInfo.provider);
                if (Array.isArray(parsed)) providers = parsed;
                else providers = [modelInfo.provider];
            } catch (e) { providers = [modelInfo.provider]; }

            let isCompatible = false;
            if (providers.length === 0) isCompatible = true;
            else if (providers.includes(channel.type)) isCompatible = true;
            else if (channel.type === 'azure' && providers.includes('openai')) isCompatible = true;
            else if (channel.type === 'aws_bedrock' && (providers.includes('anthropic') || providers.includes('aws'))) isCompatible = true;
            else if (channel.type === 'vertex' && providers.includes('google')) isCompatible = true;

            if (isCompatible) {
                setFilteredAvailable([...filteredAvailable, modelInfo]);
            }
        }
        setEnabledModels(enabledModels.filter(m => m.name !== modelName));
    };

    const updateModelConfig = (name, field, value) => {
        setEnabledModels(enabledModels.map(m => 
            m.name === name ? { ...m, [field]: value } : m
        ));
    };

    const handleTestModel = async (modelName) => {
        setTestingModel(modelName);
        try {
            const res = await axios.post(`/api/admin/channels/${channel.id}/test-model`, { model: modelName });
            if (res.data.success) {
                // Using alert or a prop notify? Since notify is in parent, we might not have it here. 
                // Wait, ChannelsManager passes setNotify? No, ModelConfigForm props don't have it.
                // We should probably rely on console or simplistic alert for this sub-component if we didn't pass setNotify.
                // Or assume window.Notification exists? No. 
                // Let's just alert for now or try to use parent's context if passed.
                alert(`Test passed: ${res.data.duration}ms`);
            } else {
                alert('Test failed');
            }
        } catch (err) {
            alert('Test error: ' + (err.response?.data?.error || err.message));
        } finally {
            setTestingModel(null);
        }
    };

    // [FIX] Define handleSave properly
    const handleSave = (e) => {
        e.preventDefault();
        const newConfigJson = {};
        enabledModels.forEach(m => {
            newConfigJson[m.name] = {
                mapTo: m.mapTo || null,
                rpm: m.rpm ? parseInt(m.rpm) : null,
                mode: m.mode
            };
        });
        onSubmit(newConfigJson);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 flex gap-4 overflow-hidden">
                {/* Left: Available */}
                <div className="w-1/3 flex flex-col border rounded-lg bg-gray-50">
                    <div className="p-3 border-b bg-white font-bold text-sm text-gray-700 flex justify-between">
                        <span>Available</span>
                        <span className="text-xs bg-blue-100 text-blue-600 px-2 rounded-full">{filteredAvailable.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {filteredAvailable.map(m => (
                            <div key={m.id} onClick={() => addModel(m)}
                                className="flex justify-between items-center p-2 bg-white border rounded cursor-pointer hover:bg-blue-50 group transition-colors">
                                <span className="text-sm font-medium text-gray-700">{m.name}</span>
                                <i className="fas fa-arrow-right text-gray-300 group-hover:text-blue-500"></i>
                            </div>
                        ))}
                        {filteredAvailable.length === 0 && <div className="p-4 text-center text-xs text-gray-400">No compatible models</div>}
                    </div>
                </div>

                {/* Right: Configured */}
                <div className="flex-1 flex flex-col border rounded-lg bg-white">
                    <div className="p-3 border-b bg-gray-100 font-bold text-sm text-gray-700 flex justify-between">
                        <span>Selected Models ({enabledModels.length})</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-0">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0 z-10">
                                <tr>
                                    <th className="p-3 border-b">Model Name</th>
                                    <th className="p-3 border-b w-32">RPM</th>
                                    <th className="p-3 border-b w-32">Billing</th>
                                    <th className="p-3 border-b w-20 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm">
                                {enabledModels.map(m => {
                                    const modelInfo = allModels.find(x => x.name === m.name) || {};
                                    const canToken = (modelInfo?.price_input > 0 || modelInfo?.price_output > 0);
                                    const canRequest = (modelInfo?.price_request > 0);
                                    const canTime = (modelInfo?.price_time > 0); 
                                    const canParam = true; 
                                    const isCurrentInvalid = (m.mode === 'token' && !canToken) || 
                                                           (m.mode === 'request' && !canRequest) ||
                                                           (m.mode === 'time' && !canTime);

                                    return (
                                    <tr key={m.name} className="border-b hover:bg-gray-50 group">
                                        <td className="p-3 font-medium text-gray-700">{m.name}</td>
                                        <td className="p-3">
                                            <input type="number" className="w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none min-w-[100px]"
                                                placeholder={modelInfo?.default_rpm || 5000}
                                                value={m.rpm}
                                                onChange={(e) => updateModelConfig(m.name, 'rpm', e.target.value)} />
                                        </td>
                                        <td className="p-3">
                                            <select className={`w-full border rounded px-1 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none ${isCurrentInvalid ? 'border-red-500 bg-red-50' : 'bg-white'}`}
                                                value={m.mode}
                                                onChange={(e) => updateModelConfig(m.name, 'mode', e.target.value)}>
                                                
                                                {(canToken || m.mode === 'token') && <option value="token" disabled={!canToken}>Token {!canToken?'(Invalid)':''}</option>}
                                                {(canRequest || m.mode === 'request') && <option value="request" disabled={!canRequest}>Request {!canRequest?'(Invalid)':''}</option>}
                                                {(canTime || m.mode === 'time') && <option value="time" disabled={!canTime}>Time {!canTime?'(Invalid)':''}</option>}
                                                {(canParam || m.mode === 'param') && <option value="param" disabled={!canParam}>Param</option>}
                                                
                                                {!canToken && !canRequest && !canTime && !canParam && <option disabled>No Pricing</option>}
                                            </select>
                                        </td>
                                        <td className="p-3 text-center whitespace-nowrap">
                                            <button onClick={() => handleTestModel(m.name)} 
                                                disabled={testingModel === m.name}
                                                className={`text-gray-400 hover:text-blue-600 transition-colors mr-3 ${testingModel === m.name ? 'animate-spin text-blue-500' : ''}`} 
                                                title="Test Connection">
                                                <i className={`fas ${testingModel === m.name ? 'fa-spinner' : 'fa-play'}`}></i>
                                            </button>
                                            <button onClick={() => removeModel(m.name)} className="text-gray-400 hover:text-red-500 transition-colors" title="Remove">
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                        {enabledModels.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">Click models on the left to add them here</div>}
                    </div>
                </div>
            </div>

            <div className="py-4 mt-4 border-t flex justify-end gap-3 bg-white">
                <button type="button" onClick={onCancel} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Configuration</button>
            </div>
        </div>
    );
};

window.ChannelsManager = ({ setNotify }) => {
    const [channels, setChannels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingChannel, setEditingChannel] = useState(null);
    
    const [showModelConfig, setShowModelConfig] = useState(false);
    const [configTargetChannel, setConfigTargetChannel] = useState(null);
    const [availableModels, setAvailableModels] = useState([]);

    const load = async () => {
        setLoading(true);
        try {
            const res = await window.api.channels.list({ limit: 100 });
            setChannels(res.data.data || []);
            const modelRes = await window.api.models.list();
            setAvailableModels(modelRes.data.data || []);
        } catch (e) {
            setNotify({ msg: 'Failed to load data', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.status = data.status === 'on' ? 1 : 0;
        const type = data.type;
        let extra = {};
        let creds = data.credentials_input; 

        try {
            if (type === 'azure') { extra = { endpoint: data.azure_endpoint, api_version: data.azure_api_version }; } 
            else if (type === 'aws_bedrock') { extra = { region: data.aws_region, access_key_id: data.aws_ak, secret_access_key: data.aws_sk }; } 
            
            if (creds && creds.trim() !== '') {
                if (type === 'vertex') { JSON.parse(creds); data.credentials = creds; } 
                else if (type !== 'aws_bedrock') { data.credentials = creds; }
            } else {
                delete data.credentials;
            }
            
            data.extra_config = JSON.stringify(extra);
            ['azure_endpoint', 'azure_api_version', 'aws_region', 'aws_ak', 'aws_sk', 'credentials_input'].forEach(k => delete data[k]);
        } catch (err) { return setNotify({ msg: 'Config Error: ' + err.message, type: 'error' }); }

        try {
            if (editingChannel) { data.models_config = editingChannel.models_config; await window.api.channels.update(editingChannel.id, data); } 
            else { data.status = 1; data.models_config = '{}'; await window.api.channels.create(data); }
            setShowModal(false); load(); setNotify({ msg: 'Saved', type: 'success' });
        } catch (err) { setNotify({ msg: err.response?.data?.error || 'Error', type: 'error' }); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this channel?')) return;
        try {
            await window.api.channels.delete(id);
            setNotify({ msg: 'Channel deleted', type: 'success' });
            load();
        } catch (err) {
            setNotify({ msg: 'Delete failed', type: 'error' });
        }
    };

    const handleSaveModels = async (newConfig) => {
        try {
            const payload = { ...configTargetChannel, models_config: newConfig };
            await window.api.channels.update(configTargetChannel.id, payload);
            setNotify({ msg: 'Models configuration saved', type: 'success' });
            setShowModelConfig(false);
            load();
        } catch (err) {
            console.error(err);
            setNotify({ msg: 'Failed to save models: ' + (err.response?.data?.error || err.message), type: 'error' });
        }
    };

    return (
        <div className="fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Channels</h1>
                    <p className="text-gray-500 text-sm">Manage upstream API channels</p>
                </div>
                <button onClick={() => { setEditingChannel(null); setShowModal(true); }} 
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors">
                    <i className="fas fa-plus mr-2"></i>New Channel
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">ID</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Models</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Operations</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {channels.map(ch => {
                            let modelCount = 0;
                            try {
                                const conf = (typeof ch.models_config === 'string') ? JSON.parse(ch.models_config) : ch.models_config;
                                modelCount = Object.keys(conf || {}).length;
                            } catch(e) {}

                            return (
                                <tr key={ch.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">#{ch.id}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-gray-800">{ch.name}</td>
                                    <td className="px-6 py-4 text-sm">
                                        <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs uppercase font-bold border border-indigo-100">{ch.type}</span>
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        <button onClick={() => { setConfigTargetChannel(ch); setShowModelConfig(true); }}
                                            className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border border-blue-200 inline-flex items-center">
                                            <i className="fas fa-cubes mr-1"></i> {modelCount} Models
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        <div className="flex flex-col items-start gap-1">
                                            <span className={`flex items-center w-fit px-2.5 py-0.5 rounded-full text-xs font-bold ${ch.status ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${ch.status ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                                {ch.status ? 'Active' : 'Disabled'}
                                            </span>
                                            {ch.last_error && (
                                                <div className="text-xs text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded flex items-start max-w-[200px]" title={ch.last_error}>
                                                    <i className="fas fa-exclamation-triangle mr-1.5 mt-0.5 flex-shrink-0"></i>
                                                    <span className="truncate">{ch.last_error}</span>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm space-x-3">
                                        <button onClick={() => { setEditingChannel(ch); setShowModal(true); }} className="text-gray-400 hover:text-blue-600 transition-colors"><i className="fas fa-edit text-lg"></i></button>
                                        <button onClick={() => handleDelete(ch.id)} className="text-gray-400 hover:text-red-600 transition-colors"><i className="fas fa-trash-alt text-lg"></i></button>
                                    </td>
                                </tr>
                            );
                        })}
                        {channels.length === 0 && !loading && <tr><td colSpan="6" className="px-6 py-12 text-center text-gray-400 italic">No channels found. Create one to get started.</td></tr>}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 fade-in px-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800">{editingChannel ? 'Edit Channel' : 'New Channel'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            <ChannelForm channel={editingChannel} onSubmit={handleSubmit} onCancel={() => setShowModal(false)} />
                        </div>
                    </div>
                </div>
            )}

            {showModelConfig && configTargetChannel && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 fade-in px-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[80vh]">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Configure Models</h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    for channel: <span className="font-bold text-blue-600">{configTargetChannel.name}</span> ({configTargetChannel.type})
                                </p>
                            </div>
                            <button onClick={() => setShowModelConfig(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="p-6 flex-1 overflow-hidden">
                            <ModelConfigForm 
                                channel={configTargetChannel} 
                                allModels={availableModels} 
                                onSubmit={handleSaveModels} 
                                onCancel={() => setShowModelConfig(false)} 
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};