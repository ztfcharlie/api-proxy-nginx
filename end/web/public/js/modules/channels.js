const { useState, useEffect } = React;
const { Button, Input, Select, Switch, Modal, ConfirmDialog, Icons } = window.UI;

window.Modules = window.Modules || {};

window.Modules.Channels = () => {
    const [channels, setChannels] = useState([]);
    const [loading, setLoading] = useState(false);
    const [models, setModels] = useState([]); // Needed for binding models

    // Modal States
    const [editModal, setEditModal] = useState({ open: false, isEdit: false });
    const [bindingModal, setBindingModal] = useState({ open: false, channel: null, list: [] });
    const [confirmModal, setConfirmModal] = useState({ open: false, id: null });

    // Form States
    const [form, setForm] = useState({});
    const [searchTerm, setSearchTerm] = useState(''); // For binding modal

    const API_BASE = '/api/admin';

    useEffect(() => {
        fetchChannels();
        fetchModels();
    }, []);

    const fetchChannels = async () => {
        setLoading(true);
        try {
            const res = await axios.get(API_BASE + '/channels');
            setChannels(res.data.data);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const fetchModels = async () => {
        try {
            const res = await axios.get(API_BASE + '/models');
            setModels(res.data.data);
        } catch (e) { console.error(e); }
    };

    // --- CRUD Handlers ---

    const openEditModal = async (channel = null) => {
        if (channel) {
            try {
                // Fetch full details
                const res = await axios.get(API_BASE + '/channels/' + channel.id);
                const fullData = res.data.data;
                let extra = { endpoint: '', api_version: '' };
                if (fullData.extra_config) {
                    extra = typeof fullData.extra_config === 'string' ? JSON.parse(fullData.extra_config) : fullData.extra_config;
                }
                setForm({ ...fullData, extra_config: extra });
                setEditModal({ open: true, isEdit: true });
            } catch (e) { alert('获取详情失败'); }
        } else {
            setForm({ 
                name: '', type: 'vertex', credentials: '', 
                extra_config: { endpoint: '', api_version: '' } 
            });
            setEditModal({ open: true, isEdit: false });
        }
    };

    const saveChannel = async () => {
        try {
            if (editModal.isEdit) {
                await axios.put(API_BASE + '/channels/' + form.id, form);
            } else {
                await axios.post(API_BASE + '/channels', form);
            }
            setEditModal({ open: false });
            fetchChannels();
        } catch (e) { alert('保存失败'); }
    };

    const deleteChannel = async () => {
        try {
            await axios.delete(API_BASE + '/channels/' + confirmModal.id);
            setConfirmModal({ open: false });
            fetchChannels();
        } catch (e) { alert('删除失败'); }
    };

    const toggleStatus = async (row) => {
        const newStatus = row.status ? 0 : 1;
        // Optimistic update
        setChannels(channels.map(c => c.id === row.id ? { ...c, status: newStatus } : c));
        try {
            await axios.put(API_BASE + '/channels/' + row.id, { status: newStatus });
        } catch (e) { fetchChannels(); }
    };

    const testConnection = async () => {
        try {
            const res = await axios.post(API_BASE + '/channels/test-connection', form);
            if (res.data.success) alert('连接成功'); else alert('连接失败: ' + res.data.message);
        } catch (e) { alert('测试出错'); }
    };

    // --- Binding Models Handlers ---

    const openBindingModal = (channel) => {
        let list = [];
        let raw = channel.models_config;
        if (typeof raw === 'string') raw = JSON.parse(raw);
        if (raw) {
            list = Object.entries(raw).map(([name, cfg]) => ({
                name,
                rpm: cfg.rpm || 100000000,
                pricing_mode: cfg.pricing_mode || 'token',
                region: cfg.region || 'us-central1'
            }));
        }
        setSearchTerm('');
        setBindingModal({ open: true, channel, list });
    };

    const addModelToBinding = (model) => {
        if (bindingModal.list.some(m => m.name === model.name)) return;
        setBindingModal(prev => ({
            ...prev,
            list: [...prev.list, { name: model.name, rpm: 100000000, pricing_mode: 'token', region: 'us-central1' }]
        }));
    };

    const removeModelFromBinding = (name) => {
        setBindingModal(prev => ({
            ...prev,
            list: prev.list.filter(m => m.name !== name)
        }));
    };

    const updateBindingConfig = (idx, field, val) => {
        const newList = [...bindingModal.list];
        newList[idx][field] = val;
        setBindingModal(prev => ({ ...prev, list: newList }));
    };

    const saveBinding = async () => {
        try {
            const configObj = {};
            bindingModal.list.forEach(m => {
                configObj[m.name] = {
                    rpm: parseInt(m.rpm),
                    pricing_mode: m.pricing_mode,
                    region: m.region,
                    enabled: true
                };
            });
            await axios.put(API_BASE + '/channels/' + bindingModal.channel.id, { models_config: configObj });
            setBindingModal({ open: false });
            fetchChannels();
        } catch (e) { alert('保存配置失败'); }
    };

    // Helper to filter models for binding modal
    const getAvailableModels = () => {
        if (!bindingModal.channel) return [];
        const type = bindingModal.channel.type;
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

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button onClick={() => openEditModal()}>+ 新增渠道</Button>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {channels.map(row => (
                            <tr key={row.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm text-gray-500">{row.id}</td>
                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{row.name}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${row.type === 'vertex' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {row.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm">
                                    <Switch checked={!!row.status} onChange={() => toggleStatus(row)} />
                                </td>
                                <td className="px-6 py-4 text-right text-sm font-medium">
                                    <button onClick={() => openBindingModal(row)} className="text-indigo-600 hover:text-indigo-900 mr-4 border border-indigo-200 px-3 py-1 rounded bg-indigo-50">⚡ 绑定模型</button>
                                    <button onClick={() => openEditModal(row)} className="text-blue-600 hover:text-blue-900 mr-4">编辑</button>
                                    <button onClick={() => setConfirmModal({ open: true, id: row.id })} className="text-red-600 hover:text-red-900">删除</button>
                                </td>
                            </tr>
                        ))}
                        {channels.length === 0 && !loading && <tr><td colSpan="5" className="p-8 text-center text-gray-400">暂无数据</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* Edit Modal */}
            <Modal 
                isOpen={editModal.open} 
                title={editModal.isEdit ? "编辑渠道" : "新增渠道"} 
                onClose={() => setEditModal({ open: false })}
                footer={
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setEditModal({ open: false })}>取消</Button>
                        <Button onClick={saveChannel}>保存</Button>
                    </div>
                }
            >
                <Input label="渠道名称" value={form.name} onChange={v => setForm({...form, name: v})} />
                <Select label="类型" value={form.type} onChange={v => setForm({...form, type: v})} className="relative z-50" options={[
                    { value: 'vertex', label: 'Google Vertex AI' },
                    { value: 'azure', label: 'Azure OpenAI' },
                    { value: 'openai', label: 'OpenAI' },
                    { value: 'anthropic', label: 'Anthropic' },
                    { value: 'qwen', label: 'Qwen' },
                    { value: 'deepseek', label: 'DeepSeek' }
                ]} />
                <Input label="凭证 (Credentials)" value={form.credentials} onChange={v => setForm({...form, credentials: v})} multiline rows={6} placeholder="JSON or Key" />
                {form.type === 'azure' && (
                    <div className="p-4 bg-blue-50 rounded mb-4">
                        <Input label="Endpoint" value={form.extra_config?.endpoint} onChange={v => setForm({...form, extra_config: {...form.extra_config, endpoint: v}})} />
                        <Input label="API Version" value={form.extra_config?.api_version} onChange={v => setForm({...form, extra_config: {...form.extra_config, api_version: v}})} />
                    </div>
                )}
                <Button onClick={testConnection} variant="secondary" className="w-full justify-center border-dashed">测试连接</Button>
            </Modal>

            {/* Binding Modal */}
            <Modal size="xl" isOpen={bindingModal.open} title="绑定模型" onClose={() => setBindingModal({ open: false })} footer={
                <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => setBindingModal({ open: false })}>取消</Button>
                    <Button onClick={saveBinding}>保存配置</Button>
                </div>
            }>
                <div className="flex h-[60vh]">
                    {/* Left Panel */}
                    <div className="w-1/3 border-r bg-gray-50 flex flex-col">
                        <div className="p-4 border-b"><input className="w-full px-3 py-2 border rounded" placeholder="搜索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {getAvailableModels().map(m => {
                                const added = bindingModal.list.some(x => x.name === m.name);
                                return (
                                    <div key={m.id} onClick={() => addModelToBinding(m)} className={`p-3 rounded cursor-pointer flex justify-between ${added ? 'bg-gray-200 text-gray-400' : 'bg-white hover:bg-blue-50'}`}>
                                        <span>{m.name}</span>
                                        <span>{added ? '✓' : '+'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    {/* Right Panel */}
                    <div className="w-2/3 flex flex-col bg-white">
                        <div className="p-4 border-b bg-gray-50 font-bold text-gray-700">已绑定 ({bindingModal.list.length})</div>
                        <div className="flex-1 overflow-y-auto p-4 pb-24">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-xs text-gray-500 uppercase">
                                        <th className="pb-2">Name</th>
                                        {bindingModal.channel?.type === 'vertex' && <th className="pb-2">Region</th>}
                                        <th className="pb-2 w-24">RPM</th>
                                        <th className="pb-2 w-24">Pricing</th>
                                        <th className="pb-2 w-8"></th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {bindingModal.list.map((item, idx) => (
                                        <tr key={idx} className="border-b last:border-0">
                                            <td className="py-2 pr-2">{item.name}</td>
                                            {bindingModal.channel?.type === 'vertex' && (
                                                <td className="py-2 pr-2"><input className="w-full border rounded px-2 py-1" value={item.region} onChange={e => updateBindingConfig(idx, 'region', e.target.value)} /></td>
                                            )}
                                            <td className="py-2 pr-2"><input type="number" className="w-full border rounded px-2 py-1" value={item.rpm} onChange={e => updateBindingConfig(idx, 'rpm', e.target.value)} /></td>
                                            <td className="py-2 pr-2">
                                                <Select value={item.pricing_mode} onChange={v => updateBindingConfig(idx, 'pricing_mode', v)} className="mb-0" options={[
                                                    { value: 'token', label: 'Token' }, { value: 'request', label: 'Request' }, { value: 'second', label: 'Second' }
                                                ]} />
                                            </td>
                                            <td className="py-2 text-right">
                                                <button onClick={() => removeModelFromBinding(item.name)} className="text-red-500"><Icons.Close /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Confirm Delete */}
            <ConfirmDialog isOpen={confirmModal.open} title="确认删除" message="确定要删除吗？" onCancel={() => setConfirmModal({ open: false })} onConfirm={deleteChannel} />
        </div>
    );
};
