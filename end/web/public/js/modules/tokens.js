const { useState, useEffect, useMemo } = React;
const { Button, Input, Select, Switch, Modal, Icons } = window.UI;

window.Modules = window.Modules || {};

window.Modules.Tokens = () => {
    const [tokens, setTokens] = useState([]);
    const [users, setUsers] = useState([]);
    const [channels, setChannels] = useState([]);
    
    const [modal, setModal] = useState({ open: false });
    const [resultModal, setResultModal] = useState({ open: false, content: '' });
    const [form, setForm] = useState({ routes: [] });

    const API_BASE = '/api/admin';

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [tRes, uRes, cRes] = await Promise.all([
                axios.get(API_BASE + '/tokens'),
                axios.get(API_BASE + '/users'),
                axios.get(API_BASE + '/channels')
            ]);
            setTokens(tRes.data.data);
            setUsers(uRes.data.data);
            setChannels(cRes.data.data);
        } catch (e) { console.error(e); }
    };

    const openModal = () => {
        setForm({
            user_id: users.length > 0 ? users[0].id : '',
            name: '',
            type: 'vertex',
            routes: [{ channel_id: '', weight: 10 }],
            expires_at: ''
        });
        setModal({ open: true });
    };

    const createToken = async () => {
        try {
            const payload = {
                ...form,
                routes: form.routes.filter(r => r.channel_id).map(r => ({...r, weight: parseInt(r.weight)})),
                expires_at: form.expires_at || null,
                limit_config: {} // No whitelist
            };
            const res = await axios.post(API_BASE + '/tokens', payload);
            setModal({ open: false });
            setResultModal({ open: true, content: JSON.stringify(res.data.credentials, null, 2) });
            fetchData();
        } catch (e) { alert('Create failed'); }
    };

    const toggleStatus = async (row) => {
        const newStatus = row.status ? 0 : 1;
        setTokens(tokens.map(t => t.id === row.id ? { ...t, status: newStatus } : t));
        try { await axios.put(API_BASE + '/tokens/' + row.id, { status: newStatus }); } catch (e) { fetchData(); }
    };

    const availableChannels = useMemo(() => {
        if (!form.type) return [];
        if (form.type === 'vertex') return channels.filter(c => c.type === 'vertex');
        if (form.type === 'azure' || form.type === 'openai') return channels.filter(c => c.type === 'azure' || c.type === 'openai');
        // Strict match for others
        return channels.filter(c => c.type === form.type);
    }, [channels, form.type]);

    return (
        <div className="space-y-6">
            <div className="flex justify-end"><Button onClick={openModal}>+ New Token</Button></div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Routes</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {tokens.map(t => (
                            <tr key={t.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm text-gray-500">{t.id}</td>
                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{t.name}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{t.username}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{t.type}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{t.expires_at ? new Date(t.expires_at).toLocaleString() : 'Never'}</td>
                                <td className="px-6 py-4 text-sm"><Switch checked={!!t.status} onChange={() => toggleStatus(t)} /></td>
                                <td className="px-6 py-4 text-xs text-gray-500">{t.routes && t.routes.map((r, i) => <div key={i}>{r.channel_name} ({r.weight})</div>)}</td>
                            </tr>
                        ))}
                        {tokens.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-gray-400">No Data</td></tr>}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={modal.open} title="Create Token" onClose={() => setModal({ open: false })} footer={
                <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setModal({ open: false })}>Cancel</Button><Button onClick={createToken}>Create</Button></div>
            }>
                <div className="space-y-6 pb-20">
                    <Select label="User" value={form.user_id} onChange={v => setForm({ ...form, user_id: v })} options={users.map(u => ({ value: u.id, label: u.username }))} className="relative z-30" />
                    <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
                    
                    <div className="grid grid-cols-2 gap-4">
                        <Select label="Type" value={form.type} onChange={v => setForm({ ...form, type: v })} options={[
                            { value: 'vertex', label: 'Vertex AI (OAuth2)' },
                            { value: 'azure', label: 'Azure OpenAI' },
                            { value: 'openai', label: 'OpenAI' },
                            { value: 'anthropic', label: 'Anthropic' },
                            { value: 'qwen', label: 'Qwen' },
                            { value: 'deepseek', label: 'DeepSeek' }
                        ]} className="relative z-20" />
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Expires At</label>
                            <input type="datetime-local" className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
                        </div>
                    </div>

                    <div className="relative z-10 border-t pt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Routes</label>
                        {form.routes.map((r, i) => (
                            <div key={i} className="flex gap-2 mb-2">
                                <div className="flex-1">
                                    <Select value={r.channel_id} onChange={v => {
                                        const nr = [...form.routes]; nr[i].channel_id = v; setForm({ ...form, routes: nr });
                                    }} options={availableChannels.map(c => ({ value: c.id, label: c.name }))} className="mb-0" />
                                </div>
                                <input type="number" className="w-20 px-3 py-2 border rounded-lg text-sm" value={r.weight} onChange={e => {
                                    const nr = [...form.routes]; nr[i].weight = e.target.value; setForm({ ...form, routes: nr });
                                }} />
                                <button onClick={() => { const nr = [...form.routes]; nr.splice(i, 1); setForm({ ...form, routes: nr }); }} className="text-red-500 p-2">×</button>
                            </div>
                        ))}
                        <button onClick={() => setForm({ ...form, routes: [...form.routes, { channel_id: '', weight: 10 }] })} className="text-blue-600 text-sm">+ Add Route</button>
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