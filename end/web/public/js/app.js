const { useState, useEffect, useMemo } = React;

// --- Sidebar Component ---
const Sidebar = ({ activeTab, onTabChange }) => (
    <div className="w-64 bg-slate-900 text-white flex-shrink-0 flex flex-col shadow-xl z-10">
        <div className="h-16 flex items-center px-6 font-bold text-xl tracking-wider bg-slate-950">
            <span className="text-blue-500 mr-2">❖</span> Gemini Proxy
        </div>
        <nav className="flex-1 py-6 space-y-1">
            <button onClick={() => onTabChange('channels')} className={`w-full flex items-center px-6 py-3 transition-all duration-200 border-l-4 ${activeTab === 'channels' ? 'bg-slate-800 border-blue-500 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <Icons.Channels /> 渠道管理
            </button>
            <button onClick={() => onTabChange('models')} className={`w-full flex items-center px-6 py-3 transition-all duration-200 border-l-4 ${activeTab === 'models' ? 'bg-slate-800 border-blue-500 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <Icons.Models /> 模型管理
            </button>
            <button onClick={() => onTabChange('tokens')} className={`w-full flex items-center px-6 py-3 transition-all duration-200 border-l-4 ${activeTab === 'tokens' ? 'bg-slate-800 border-blue-500 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <Icons.Tokens /> 令牌管理
            </button>
            <button onClick={() => onTabChange('users')} className={`w-full flex items-center px-6 py-3 transition-all duration-200 border-l-4 ${activeTab === 'users' ? 'bg-slate-800 border-blue-500 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <Icons.Users /> 用户管理
            </button>
        </nav>
        <div className="p-4 bg-slate-950 text-xs text-slate-500 text-center">v3.2.1</div>
    </div>
);

// --- Main App Component ---
const App = () => {
    const [activeTab, setActiveTab] = useState('channels');
    const [activeModelTab, setActiveModelTab] = useState('openai');
    const [channels, setChannels] = useState([]);
    const [models, setModels] = useState([]);
    const [tokens, setTokens] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);

    // Dialog States
    const [channelModal, setChannelModal] = useState({ open: false, isEdit: false });
    const [channelModelsModal, setChannelModelsModal] = useState({ open: false, channel: null, list: [] });
    const [modelModal, setModelModal] = useState({ open: false, isEdit: false });
    const [tokenModal, setTokenModal] = useState({ open: false });
    const [userModal, setUserModal] = useState({ open: false });
    const [confirmModal, setConfirmModal] = useState({ open: false, type: null, id: null });
    const [resultModal, setResultModal] = useState({ open: false, content: '' });

    // Form States
    const [channelForm, setChannelForm] = useState({});
    const [modelForm, setModelForm] = useState({});
    const [tokenForm, setTokenForm] = useState({ routes: [{ channel_id: '', weight: 10 }] });
    const [userForm, setUserForm] = useState({});
    const [searchTerm, setSearchTerm] = useState('');

    const API_BASE = '/api/admin';

    useEffect(() => {
        fetchData('channels');
        fetchData('models');
    }, []);

    const fetchData = async (type) => {
        setLoading(true);
        try {
            if (type === 'channels') {
                const res = await axios.get(API_BASE + '/channels');
                setChannels(res.data.data);
            } else if (type === 'models') {
                const res = await axios.get(API_BASE + '/models');
                setModels(res.data.data);
            } else if (type === 'tokens') {
                const [tRes, uRes, cRes] = await Promise.all([
                    axios.get(API_BASE + '/tokens'),
                    axios.get(API_BASE + '/users'),
                    axios.get(API_BASE + '/channels')
                ]);
                setTokens(tRes.data.data);
                setUsers(uRes.data.data);
                setChannels(cRes.data.data);
            } else if (type === 'users') {
                const res = await axios.get(API_BASE + '/users');
                setUsers(res.data.data);
            }
        } catch (err) {
            console.error(err);
            const msg = (err.response && err.response.data && err.response.data.error) || err.message;
            alert('加载数据失败: ' + msg);
        }
        setLoading(false);
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        fetchData(tab);
    };

    // --- Channel Handlers ---
    const openChannelModal = async (channel = null) => {
        if (channel) {
            try {
                // Fetch full details including credentials
                const res = await axios.get(API_BASE + '/channels/' + channel.id);
                const fullChannel = res.data.data;

                let extra = { endpoint: '', api_version: '' };
                if (fullChannel.extra_config) {
                    extra = typeof fullChannel.extra_config === 'string' 
                        ? JSON.parse(fullChannel.extra_config) 
                        : fullChannel.extra_config;
                }
                setChannelForm({ ...fullChannel, extra_config: extra });
                setChannelModal({ open: true, isEdit: true });
            } catch (err) {
                alert('获取渠道详情失败');
            }
        } else {
            setChannelForm({ 
                name: '', type: 'vertex', credentials: '', 
                extra_config: { endpoint: '', api_version: '' } 
            });
            setChannelModal({ open: true, isEdit: false });
        }
    };

    const saveChannel = async () => {
        try {
            if (channelModal.isEdit) {
                await axios.put(API_BASE + '/channels/' + channelForm.id, channelForm);
            } else {
                await axios.post(API_BASE + '/channels', channelForm);
            }
            setChannelModal({ open: false });
            fetchData('channels');
        } catch (err) {
            const msg = (err.response && err.response.data && err.response.data.error) || 'Unknown Error';
            alert('保存失败: ' + msg);
        }
    };

    const toggleChannelStatus = async (row) => {
        const newStatus = row.status ? 0 : 1;
        const originalData = [...channels];
        setChannels(channels.map(c => c.id === row.id ? { ...c, status: newStatus } : c));
        try {
            await axios.put(API_BASE + '/channels/' + row.id, { status: newStatus });
        } catch (err) {
            alert('更新状态失败');
            setChannels(originalData);
        }
    };

    // --- Channel Models Binding Handlers ---
    const openChannelModelsModal = (channel) => {
        let modelsList = [];
        let rawConfig = channel.models_config;
        if (typeof rawConfig === 'string') rawConfig = JSON.parse(rawConfig);
        if (rawConfig) {
            modelsList = Object.entries(rawConfig).map(([name, cfg]) => ({
                name,
                rpm: cfg.rpm || 100000000,
                pricing_mode: cfg.pricing_mode || 'token',
                region: cfg.region || 'us-central1' // Load region
            }));
        }
        setSearchTerm('');
        setChannelModelsModal({ open: true, channel: channel, list: modelsList });
    };

    const addModelToChannel = (model) => {
        if (channelModelsModal.list.some(m => m.name === model.name)) return;
        
        const newItem = {
            name: model.name,
            rpm: 100000000,
            pricing_mode: 'token',
            region: 'us-central1' // Default region
        };
        setChannelModelsModal(prev => ({ ...prev, list: [...prev.list, newItem] }));
    };

    const removeModelFromChannel = (name) => {
        setChannelModelsModal(prev => ({
            ...prev,
            list: prev.list.filter(m => m.name !== name)
        }));
    };

    const updateChannelModelConfig = (idx, field, value) => {
        const newList = [...channelModelsModal.list];
        newList[idx][field] = value;
        setChannelModelsModal(prev => ({ ...prev, list: newList }));
    };

    const saveChannelModels = async () => {
        try {
            const configObj = {};
            channelModelsModal.list.forEach(m => {
                configObj[m.name] = {
                    rpm: parseInt(m.rpm),
                    pricing_mode: m.pricing_mode,
                    enabled: true,
                    region: m.region // Save region
                };
            });
            
            await axios.put(API_BASE + '/channels/' + channelModelsModal.channel.id, {
                models_config: configObj
            });
            
            setChannelModelsModal({ open: false, channel: null, list: [] });
            fetchData('channels');
        } catch (err) {
            alert('保存模型配置失败');
        }
    };

    const getAvailableModelsForChannel = () => {
        if (!channelModelsModal.channel) return [];
        const type = channelModelsModal.channel.type;
        
        return models.filter(m => {
            let match = false;
            if(type === 'vertex') match = m.provider === 'google';
            else if(type === 'azure' || type === 'openai') match = m.provider === 'openai';
            else if(type === 'anthropic') match = m.provider === 'anthropic';
            else if(type === 'qwen') match = m.provider === 'qwen';
            else if(type === 'deepseek') match = m.provider === 'deepseek';
            else match = true;

            if (match && searchTerm) {
                match = m.name.toLowerCase().includes(searchTerm.toLowerCase());
            }
            return match;
        });
    };

    const testConnection = async () => {
        try {
            const res = await axios.post(API_BASE + '/channels/test-connection', channelForm);
            if (res.data.success) alert(res.data.message);
            else alert('测试失败: ' + res.data.message);
        } catch(e) { alert('测试出错'); }
    };

    // --- Model Handlers ---
    const openModelModal = (model = null) => {
        if (model) {
            setModelForm({ ...model });
        } else {
            setModelForm({ 
                provider: activeModelTab, 
                name: '', 
                price_input: 0, price_output: 0, price_cache: 0, price_time: 0, price_request: 0 
            });
        }
        setModelModal({ open: true, isEdit: !!model });
    };

    const saveModel = async () => {
        try {
            if (modelModal.isEdit) {
                await axios.put(API_BASE + '/models/' + modelForm.id, modelForm);
            } else {
                await axios.post(API_BASE + '/models', modelForm);
            }
            setModelModal({ open: false });
            fetchData('models');
        } catch (err) {
            alert('保存失败');
        }
    };

    const handleDelete = async () => {
        try {
            if (confirmModal.type === 'channel') {
                await axios.delete(API_BASE + '/channels/' + confirmModal.id);
                fetchData('channels');
            } else if (confirmModal.type === 'model') {
                await axios.delete(API_BASE + '/models/' + confirmModal.id);
                fetchData('models');
            }
            setConfirmModal({ open: false });
        } catch (err) {
            alert('删除失败');
        }
    };

    // --- Token Handlers ---
    const openTokenModal = () => {
        setTokenForm({
            user_id: users.length > 0 ? users[0].id : '',
            name: '',
            type: 'vertex',
            routes: [{ channel_id: '', weight: 10 }]
        });
        setTokenModal({ open: true });
    };

    const createToken = async () => {
        try {
            const payload = {
                ...tokenForm,
                routes: tokenForm.routes.filter(r => r.channel_id).map(r => ({...r, weight: parseInt(r.weight)}))
            };
            const res = await axios.post(API_BASE + '/tokens', payload);
            setTokenModal({ open: false });
            setResultModal({ open: true, content: JSON.stringify(res.data.credentials, null, 2) });
            fetchData('tokens');
        } catch (err) {
            const msg = (err.response && err.response.data && err.response.data.error) || 'Unknown Error';
            alert('创建失败: ' + msg);
        }
    };

    // --- User Handlers ---
    const createUser = async () => {
        if (!userForm.username) return;
        try {
            await axios.post(API_BASE + '/users', userForm);
            setUserModal({ open: false });
            fetchData('users');
        } catch (err) {
            alert('创建失败');
        }
    };

    // --- Render Helpers ---
    const filteredModels = useMemo(() => {
        return models.filter(m => m.provider === activeModelTab);
    }, [models, activeModelTab]);

    const availableChannels = useMemo(() => {
        if (tokenForm.type === 'vertex') {
            return channels.filter(c => c.type === 'vertex');
        } else {
            return channels.filter(c => c.type !== 'vertex');
        }
    }, [channels, tokenForm.type]);

    return (
        <div className="flex h-screen bg-gray-100 font-sans antialiased">
            <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
            
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white shadow-sm z-0 h-16 flex items-center justify-between px-8">
                    <h2 className="text-xl font-semibold text-gray-800">
                        {activeTab === 'channels' && '真实渠道 (Upstream Channels)'}
                        {activeTab === 'models' && '模型定价 (Model Pricing)'}
                        {activeTab === 'tokens' && '虚拟令牌 (Virtual Tokens)'}
                        {activeTab === 'users' && '系统用户 (System Users)'}
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-500">Admin Console</div>
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">A</div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8">
                    {/* Channels View */}
                    {activeTab === 'channels' && (
                        <div className="space-y-6">
                            <div className="flex justify-end">
                                <Button onClick={() => openChannelModal()}>+ 新增渠道</Button>
                            </div>
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {channels.map(row => (
                                            <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.id}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.name}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                        row.type === 'vertex' ? 'bg-blue-100 text-blue-800' : 
                                                        row.type === 'azure' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                                                    }`}>
                                                        {row.type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <Switch 
                                                        checked={!!row.status} 
                                                        onChange={() => toggleChannelStatus(row)}
                                                    />
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button onClick={() => openChannelModelsModal(row)} className="text-indigo-600 hover:text-indigo-900 mr-4 font-semibold border border-indigo-200 px-3 py-1 rounded bg-indigo-50">⚡ 绑定模型</button>
                                                    <button onClick={() => openChannelModal(row)} className="text-blue-600 hover:text-blue-900 mr-4">编辑</button>
                                                    <button onClick={() => setConfirmModal({ open: true, type: 'channel', id: row.id })} className="text-red-600 hover:text-red-900">删除</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {channels.length === 0 && <div className="p-8 text-center text-gray-400">暂无数据</div>}
                            </div>
                        </div>
                    )}

                    {/* Models View */}
                    {activeTab === 'models' && (
                        <div className="space-y-6">
                            <div className="flex border-b border-gray-200">
                                {['openai', 'google', 'anthropic', 'qwen', 'deepseek'].map(provider => (
                                    <button
                                        key={provider}
                                        onClick={() => setActiveModelTab(provider)}
                                        className={`py-4 px-6 font-medium text-sm border-b-2 transition-colors ${
                                            activeModelTab === provider
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                    >
                                        {provider.toUpperCase()}
                                    </button>
                                ))}
                            </div>

                            <div className="flex justify-end">
                                <Button onClick={() => openModelModal()}>+ 新增 {activeModelTab} 模型</Button>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">模型名称</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Input ($/1M)</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Output ($/1M)</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cache ($/1M)</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Time ($/s)</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Req ($/req)</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {filteredModels.map(m => (
                                            <tr key={m.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{m.name}</td>
                                                <td className="px-6 py-4 text-sm text-right text-gray-500">{m.price_input}</td>
                                                <td className="px-6 py-4 text-sm text-right text-gray-500">{m.price_output}</td>
                                                <td className="px-6 py-4 text-sm text-right text-gray-500">{m.price_cache}</td>
                                                <td className="px-6 py-4 text-sm text-right text-gray-500">{m.price_time}</td>
                                                <td className="px-6 py-4 text-sm text-right text-gray-500">{m.price_request}</td>
                                                <td className="px-6 py-4 text-right text-sm font-medium">
                                                    <button onClick={() => openModelModal(m)} className="text-blue-600 hover:text-blue-900 mr-4">编辑</button>
                                                    <button onClick={() => setConfirmModal({ open: true, type: 'model', id: m.id })} className="text-red-600 hover:text-red-900">删除</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredModels.length === 0 && <div className="p-8 text-center text-gray-400">该厂商下暂无模型</div>}
                            </div>
                        </div>
                    )}

                    {/* Tokens View */}
                    {activeTab === 'tokens' && (
                        <div className="space-y-6">
                            <div className="flex justify-end">
                                <Button onClick={openTokenModal}>+ 创建 Token</Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {tokens.map(token => (
                                    <div key={token.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="font-bold text-gray-900">{token.name}</h3>
                                                <div className="text-xs text-gray-500 mt-1">User: {token.username}</div>
                                            </div>
                                            <span className={`px-2 py-1 text-xs font-bold rounded ${
                                                token.type === 'vertex' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                                            }`}>{token.type}</span>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-xs font-semibold text-gray-400 uppercase">Routes</div>
                                            {token.routes && token.routes.map((r, i) => (
                                                <div key={i} className="flex justify-between text-sm items-center bg-gray-50 p-2 rounded">
                                                    <span className="text-gray-700 truncate flex-1 mr-2">{r.channel_name}</span>
                                                    <span className="text-gray-400 text-xs">Weight: {r.weight}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Users View */}
                    {activeTab === 'users' && (
                        <div className="space-y-6">
                            <div className="flex justify-end">
                                <Button onClick={() => setUserModal({ open: true })}>+ 新增用户</Button>
                            </div>
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户名</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">备注</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {users.map(u => (
                                            <tr key={u.id}>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.id}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{u.username}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.remark || '-'}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* --- MODALS --- */}

            {/* Channel Modal (Basic Info) */}
            <Modal 
                isOpen={channelModal.open} 
                title={channelModal.isEdit ? "编辑渠道" : "新增渠道"} 
                onClose={() => setChannelModal({ open: false })}
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button variant="secondary" onClick={() => setChannelModal({ open: false })}>取消</Button>
                        <Button onClick={saveChannel}>保存</Button>
                    </div>
                }
            >
                <Input label="渠道名称" value={channelForm.name} onChange={v => setChannelForm({...channelForm, name: v})} placeholder="例如: Vertex US-Central" />
                <Select label="类型" value={channelForm.type} onChange={v => setChannelForm({...channelForm, type: v})} options={[
                    { value: 'vertex', label: 'Google Vertex AI' },
                    { value: 'azure', label: 'Azure OpenAI' },
                    { value: 'openai', label: 'OpenAI' },
                    { value: 'anthropic', label: 'Anthropic' },
                    { value: 'qwen', label: 'Qwen (Aliyun)' },
                    { value: 'deepseek', label: 'DeepSeek' }
                ]} />
                <Input 
                    label="凭证 (Credentials)" 
                    value={channelForm.credentials} 
                    onChange={v => setChannelForm({...channelForm, credentials: v})} 
                    multiline rows={6}
                    placeholder={channelForm.type === 'vertex' ? '粘贴 Google Service Account JSON' : '粘贴 API Key'} 
                />
                {channelForm.type === 'azure' && (
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 mb-4">
                        <h4 className="text-xs font-bold text-blue-800 uppercase mb-3">Azure 配置</h4>
                        <Input label="Endpoint" value={channelForm.extra_config && channelForm.extra_config.endpoint} onChange={v => setChannelForm({...channelForm, extra_config: {...channelForm.extra_config, endpoint: v}})} placeholder="https://xxx.openai.azure.com" />
                        <Input label="API Version" value={channelForm.extra_config && channelForm.extra_config.api_version} onChange={v => setChannelForm({...channelForm, extra_config: {...channelForm.extra_config, api_version: v}})} placeholder="2023-05-15" />
                    </div>
                )}
                <div className="mt-4">
                    <Button onClick={testConnection} variant="ghost" className="text-sm w-full justify-center border border-dashed border-gray-300">测试连接</Button>
                </div>
            </Modal>

            {/* Channel Models Binding Modal (New) */}
            <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm transition-opacity ${channelModelsModal.open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl m-4 transform transition-all flex flex-col h-[85vh]">
                    <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                        <div>
                            <h3 className="text-xl font-semibold text-gray-800">绑定模型</h3>
                            <p className="text-sm text-gray-500 mt-1">为渠道 <span className="font-bold text-blue-600">{channelModelsModal.channel && channelModelsModal.channel.name}</span> 配置可用模型</p>
                        </div>
                        <button onClick={() => setChannelModelsModal({...channelModelsModal, open: false})} className="text-gray-400 hover:text-gray-600 transition-colors">
                            <Icons.Close />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-hidden flex">
                        {/* Left: Available Models */}
                        <div className="w-1/3 border-r border-gray-200 flex flex-col bg-gray-50">
                            <div className="p-4 border-b border-gray-200">
                                <input 
                                    type="text" 
                                    placeholder="搜索可用模型..." 
                                    className="w-full px-3 py-2 border rounded-lg text-sm"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {getAvailableModelsForChannel().map(m => {
                                    const isAdded = channelModelsModal.list.some(x => x.name === m.name);
                                    return (
                                        <button 
                                            key={m.id}
                                            onClick={() => addModelToChannel(m)}
                                            disabled={isAdded}
                                            className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all flex justify-between items-center ${
                                                isAdded ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-blue-50 hover:text-blue-700 shadow-sm'
                                            }`}
                                        >
                                            <span>{m.name}</span>
                                            {!isAdded && <span className="text-blue-500 font-bold">+</span>}
                                            {isAdded && <span className="text-gray-400">✓</span>}
                                        </button>
                                    );
                                })}
                                {getAvailableModelsForChannel().length === 0 && (
                                    <div className="text-center text-gray-400 text-sm p-4">没有匹配的模型</div>
                                )}
                            </div>
                        </div>

                        {/* Right: Configured Models */}
                        <div className="w-2/3 flex flex-col bg-white">
                            <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                                <span className="font-semibold text-gray-700 text-sm">已绑定模型 ({channelModelsModal.list.length})</span>
                                <span className="text-xs text-gray-500">配置 RPM 和计费模式</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead>
                                        <tr>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">模型名称</th>
                                            {channelModelsModal.channel?.type === 'vertex' && (
                                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-28">区域 (Region)</th>
                                            )}
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">RPM</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">计费模式</th>
                                            <th className="px-3 py-2 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {channelModelsModal.list.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-3 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                                                {channelModelsModal.channel?.type === 'vertex' && (
                                                    <td className="px-3 py-3">
                                                        <input 
                                                            type="text" 
                                                            className="w-full px-2 py-1 border rounded text-sm"
                                                            placeholder="us-central1"
                                                            value={item.region}
                                                            onChange={(e) => updateChannelModelConfig(idx, 'region', e.target.value)}
                                                        />
                                                    </td>
                                                )}
                                                <td className="px-3 py-3">
                                                    <input 
                                                        type="number" 
                                                        className="w-full px-2 py-1 border rounded text-sm"
                                                        value={item.rpm}
                                                        onChange={(e) => updateChannelModelConfig(idx, 'rpm', e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-3 py-3">
                                                    <select 
                                                        className="w-full px-2 py-1 border rounded text-sm bg-white"
                                                        value={item.pricing_mode}
                                                        onChange={(e) => updateChannelModelConfig(idx, 'pricing_mode', e.target.value)}
                                                    >
                                                        <option value="token">Token</option>
                                                        <option value="second">Second</option>
                                                        <option value="request">Request</option>
                                                    </select>
                                                </td>
                                                <td className="px-3 py-3 text-right">
                                                    <button 
                                                        onClick={() => removeModelFromChannel(item.name)}
                                                        className="text-red-400 hover:text-red-600"
                                                    >
                                                        <Icons.Close />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {channelModelsModal.list.length === 0 && (
                                            <tr>
                                                <td colSpan={channelModelsModal.channel?.type === 'vertex' ? 5 : 4} className="p-8 text-center text-gray-400 text-sm border-dashed border-2 border-gray-100 rounded-lg m-4">
                                                    请从左侧选择要绑定的模型
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setChannelModelsModal({...channelModelsModal, open: false})}>取消</Button>
                        <Button onClick={saveChannelModels}>保存配置</Button>
                    </div>
                </div>
            </div>

            {/* Model Modal */}
            <Modal
                isOpen={modelModal.open}
                title={modelModal.isEdit ? "编辑模型" : "新增模型"}
                onClose={() => setModelModal({ open: false })}
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button variant="secondary" onClick={() => setModelModal({ open: false })}>取消</Button>
                        <Button onClick={saveModel}>保存</Button>
                    </div>
                }
            >
                <div className="mb-4 text-sm text-gray-500">厂商: <span className="font-bold text-gray-800 uppercase">{modelForm.provider}</span></div>
                <Input label="模型名称 (ID)" value={modelForm.name} onChange={v => setModelForm({...modelForm, name: v})} placeholder="如: gpt-4-1106-preview" />
                
                <div className="grid grid-cols-2 gap-4">
                    <Input label="输入价格 ($/1M)" type="number" value={modelForm.price_input} onChange={v => setModelForm({...modelForm, price_input: v})} />
                    <Input label="输出价格 ($/1M)" type="number" value={modelForm.price_output} onChange={v => setModelForm({...modelForm, price_output: v})} />
                    <Input label="缓存价格 ($/1M)" type="number" value={modelForm.price_cache} onChange={v => setModelForm({...modelForm, price_cache: v})} />
                    <Input label="时间价格 ($/s)" type="number" value={modelForm.price_time} onChange={v => setModelForm({...modelForm, price_time: v})} />
                    <Input label="请求价格 ($/req)" type="number" value={modelForm.price_request} onChange={v => setModelForm({...modelForm, price_request: v})} />
                </div>
            </Modal>

            <Modal
                isOpen={tokenModal.open}
                title="创建虚拟令牌"
                onClose={() => setTokenModal({ open: false })}
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button variant="secondary" onClick={() => setTokenModal({ open: false })}>取消</Button>
                        <Button onClick={createToken}>创建并生成 Key</Button>
                    </div>
                }
            >
                <div className="space-y-6 pb-12">
                    <Select label="归属用户" value={tokenForm.user_id} onChange={v => setTokenForm({...tokenForm, user_id: v})} 
                        options={users.map(u => ({ value: u.id, label: u.username }))} className="relative z-30" />
                    <Input label="名称备注" value={tokenForm.name} onChange={v => setTokenForm({...tokenForm, name: v})} />
                    <Select label="协议类型" value={tokenForm.type} onChange={v => setTokenForm({...tokenForm, type: v})} options={[
                        { value: 'vertex', label: 'Google Vertex (OAuth2)' },
                        { value: 'azure', label: 'OpenAI / Azure (Key)' }
                    ]} className="relative z-20" />
                    
                    <div className="relative z-10">
                        <label className="block text-sm font-medium text-gray-700 mb-2">路由绑定</label>
                        {tokenForm.routes.map((route, idx) => (
                            <div key={idx} className="flex gap-2 mb-2 items-center">
                                <div className="flex-1">
                                    <select 
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                        value={route.channel_id}
                                        onChange={e => {
                                            const newRoutes = [...tokenForm.routes];
                                            newRoutes[idx].channel_id = e.target.value;
                                            setTokenForm({...tokenForm, routes: newRoutes});
                                        }}
                                    >
                                        <option value="">选择渠道...</option>
                                        {availableChannels.map(c => (
                                            <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                                        ))}
                                    </select>
                                </div>
                                <input type="number" className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="权重" value={route.weight} 
                                    onChange={e => {
                                        const newRoutes = [...tokenForm.routes];
                                        newRoutes[idx].weight = e.target.value;
                                        setTokenForm({...tokenForm, routes: newRoutes});
                                    }}
                                />
                                <button onClick={() => {
                                    const newRoutes = [...tokenForm.routes];
                                    newRoutes.splice(idx, 1);
                                    setTokenForm({...tokenForm, routes: newRoutes});
                                }} className="text-red-500 hover:bg-red-50 p-2 rounded font-bold">×</button>
                            </div>
                        ))}
                        
                        {availableChannels.length === 0 && (
                            <div className="text-xs text-amber-600 mb-2 bg-amber-50 p-2 rounded">
                                当前协议类型 ({tokenForm.type}) 下没有可用的渠道。请先在渠道管理中创建对应类型的渠道。
                            </div>
                        )}

                        <button onClick={() => setTokenForm({...tokenForm, routes: [...tokenForm.routes, { channel_id: '', weight: 10 }]})} 
                            className="text-sm text-blue-600 font-medium hover:underline mt-2">+ 添加路由 (负载均衡)</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={userModal.open} title="新增用户" onClose={() => setUserModal({ open: false })} footer={
                <div className="flex justify-end gap-3 w-full">
                    <Button variant="secondary" onClick={() => setUserModal({ open: false })}>取消</Button>
                    <Button onClick={createUser}>创建</Button>
                </div>
            }>
                <Input label="用户名" value={userForm.username} onChange={v => setUserForm({...userForm, username: v})} />
                <Input label="密码" type="password" value={userForm.password} onChange={v => setUserForm({...userForm, password: v})} />
                <Input label="备注" value={userForm.remark} onChange={v => setUserForm({...userForm, remark: v})} />
            </Modal>

            <ConfirmDialog 
                isOpen={confirmModal.open} 
                title="确认删除" 
                message="确定要删除这个项目吗？此操作无法撤销。" 
                onCancel={() => setConfirmModal({ open: false })}
                onConfirm={handleDelete}
            />

            <Modal isOpen={resultModal.open} title="令牌生成成功" onClose={() => setResultModal({ open: false })}>
                <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                    <p className="text-green-800 font-bold mb-2 text-sm">请立即保存以下凭证：</p>
                    <pre className="bg-white p-4 rounded border border-green-200 text-xs font-mono overflow-x-auto">{resultModal.content}</pre>
                </div>
            </Modal>

        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
