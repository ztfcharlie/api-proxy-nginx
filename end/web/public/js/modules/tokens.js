const { useState, useEffect, useMemo } = React;
const { Button, Input, Select, Switch, Modal, Icons } = window.UI;

window.Modules = window.Modules || {};

window.Modules.Tokens = () => {
    const [tokens, setTokens] = useState([]);
    const [users, setUsers] = useState([]);
    const [channels, setChannels] = useState([]);
    const [models, setModels] = useState([]); // For whitelist
    
    const [modal, setModal] = useState({ open: false });
    const [resultModal, setResultModal] = useState({ open: false, content: '' });
    const [form, setForm] = useState({ routes: [], allowed_models: [] });

    const API_BASE = '/api/admin';

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [tRes, uRes, cRes, mRes] = await Promise.all([
                axios.get(API_BASE + '/tokens'),
                axios.get(API_BASE + '/users'),
                axios.get(API_BASE + '/channels'),
                axios.get(API_BASE + '/models')
            ]);
            setTokens(tRes.data.data);
            setUsers(uRes.data.data);
            setChannels(cRes.data.data);
            setModels(mRes.data.data);
        } catch (e) { console.error(e); }
    };

    const openModal = () => {
        setForm({
            user_id: users.length > 0 ? users[0].id : '',
            name: '',
            type: 'vertex',
            routes: [{ channel_id: '', weight: 10 }],
            expires_at: '',
            enable_whitelist: false,
            allowed_models: []
        });
        setModal({ open: true });
    };

    const createToken = async () => {
        try {
            const payload = {
                ...form,
                routes: form.routes.filter(r => r.channel_id).map(r => ({ ...r, weight: parseInt(r.weight) })),
                expires_at: form.expires_at || null,
                limit_config: { allowed_models: form.enable_whitelist ? form.allowed_models : [] }
            };
            const res = await axios.post(API_BASE + '/tokens', payload);
            setModal({ open: false });
            setResultModal({ open: true, content: JSON.stringify(res.data.credentials, null, 2) });
            fetchData();
        } catch (e) { alert('创建失败'); }
    };

    const toggleStatus = async (row) => {
        const newStatus = row.status ? 0 : 1;
        setTokens(tokens.map(t => t.id === row.id ? { ...t, status: newStatus } : t));
        try { await axios.put(API_BASE + '/tokens/' + row.id, { status: newStatus }); } catch (e) { fetchData(); }
    };

    const availableChannels = useMemo(() => {
        if (form.type === 'vertex') return channels.filter(c => c.type === 'vertex');
        return channels.filter(c => c.type !== 'vertex');
    }, [channels, form.type]);

    const getAvailableWhitelistModels = () => {
        // If no routes selected, maybe show all? Or none. Let's show based on Token Type.
        // Better: Show based on selected routes' channel types.
        
        const selectedChannelIds = form.routes.map(r => parseInt(r.channel_id)).filter(id => id);
        if (selectedChannelIds.length === 0) {
            // Fallback: filter by token type
            if (form.type === 'vertex') return models.filter(m => m.provider === 'google');
            return models.filter(m => m.provider !== 'google');
        }

        const allowedProviders = new Set();
        selectedChannelIds.forEach(id => {
            const channel = channels.find(c => c.id === id);
            if (channel) {
                if (channel.type === 'vertex') allowedProviders.add('google');
                else if (channel.type === 'azure' || channel.type === 'openai') allowedProviders.add('openai');
                else if (channel.type === 'anthropic') allowedProviders.add('anthropic');
                else if (channel.type === 'qwen') allowedProviders.add('qwen');
                else if (channel.type === 'deepseek') allowedProviders.add('deepseek');
            }
        });

        return models.filter(m => allowedProviders.has(m.provider));
    };

    return (
        <div className="space-y-6">
            {/* ... (rest of render) */}
            
            <Modal isOpen={modal.open} title="Create Token" onClose={() => setModal({ open: false })} footer={
                <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setModal({ open: false })}>Cancel</Button><Button onClick={createToken}>Create</Button></div>
            }>
                {/* ... (inputs) */}

                    <div className="border-t pt-4">
                        <div className="flex items-center mb-4">
                            <Switch checked={form.enable_whitelist} onChange={v => setForm({ ...form, enable_whitelist: v })} />
                            <span className="ml-2 text-sm">Enable Model Whitelist</span>
                        </div>
                        {form.enable_whitelist && (
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="mb-2">
                                    <select className="w-full px-3 py-2 border rounded text-sm" onChange={e => {
                                        if (e.target.value && !form.allowed_models.includes(e.target.value)) {
                                            setForm(prev => ({ ...prev, allowed_models: [...prev.allowed_models, e.target.value] }));
                                            e.target.value = '';
                                        }
                                    }}>
                                        <option value="">+ Add Model...</option>
                                        {getAvailableWhitelistModels().map(m => <option key={m.id} value={m.name}>{m.name} ({m.provider})</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {form.allowed_models.map(m => (
                                        <span key={m} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded flex items-center">{m} <button onClick={() => setForm(prev => ({ ...prev, allowed_models: prev.allowed_models.filter(x => x !== m) }))} className="ml-2 font-bold">×</button></span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            <Modal isOpen={resultModal.open} title="Success" onClose={() => setResultModal({ open: false })}>
                <div className="bg-green-50 p-4 rounded mb-4"><pre className="text-xs overflow-x-auto">{resultModal.content}</pre></div>
                <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => navigator.clipboard.writeText(resultModal.content)}>Copy</Button>
                    <Button onClick={() => setResultModal({ open: false })}>Close</Button>
                </div>
            </Modal>
        </div>
    );
};
