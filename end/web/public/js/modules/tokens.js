const { useState, useEffect, useMemo } = React;
const { Button, Input, Select, Switch, Modal, Icons, ConfirmDialog } = window.UI;

window.Modules = window.Modules || {};

window.Modules.Tokens = () => {
    const [tokens, setTokens] = useState([]);
    const [users, setUsers] = useState([]);
    const [channels, setChannels] = useState([]);
    
    const [modal, setModal] = useState({ open: false, isEdit: false });
    const [resultModal, setResultModal] = useState({ open: false, content: '' });
    const [confirmModal, setConfirmModal] = useState({ open: false, id: null });
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

    const openModal = (token = null) => {
        if (token) {
            setForm({
                id: token.id,
                user_id: token.user_id,
                name: token.name,
                type: token.type,
                routes: token.routes ? token.routes.map(r => ({ channel_id: r.channel_id, weight: r.weight })) : [],
                expires_at: token.expires_at ? token.expires_at.slice(0, 16) : '',
            });
            setModal({ open: true, isEdit: true });
        } else {
            setForm({
                user_id: users.length > 0 ? users[0].id : '',
                name: '',
                type: 'vertex',
                routes: [{ channel_id: '', weight: 10 }],
                expires_at: ''
            });
            setModal({ open: true, isEdit: false });
        }
    };

    const saveToken = async () => {
        if (!form.name || form.name.trim() === '') {
            alert('Please enter a Token Name');
            return;
        }
        try {
            const payload = {
                ...form,
                routes: form.routes.filter(r => r.channel_id).map(r => ({...r, weight: parseInt(r.weight)})),
                expires_at: form.expires_at || null,
                limit_config: {} 
            };

            if (modal.isEdit) {
                await axios.put(API_BASE + '/tokens/' + form.id, payload);
                setModal({ open: false });
                fetchData();
            } else {
                const res = await axios.post(API_BASE + '/tokens', payload);
                setModal({ open: false });
                setResultModal({ open: true, content: JSON.stringify(res.data.credentials, null, 2) });
                fetchData();
            }
        } catch (e) { alert('Operation failed'); }
    };

    const deleteToken = async () => {
        try {
            await axios.delete(API_BASE + '/tokens/' + confirmModal.id);
            setConfirmModal({ open: false });
            fetchData();
        } catch (e) { alert('Delete failed'); }
    };

    const verifyToken = async (token) => {
        try {
            const res = await axios.post(API_BASE + '/tokens/' + token.id + '/verify');
            const lines = res.data.messages.join('\n');
            setResultModal({ open: true, content: lines, title: res.data.success ? 'Verification Passed' : 'Verification Issues' });
        } catch (e) { 
            alert('Verify failed: ' + e.message);
        }
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
        return channels.filter(c => c.type === form.type);
    }, [channels, form.type]);

    return (
        <div className="space-y-6">
            <div className="flex justify-end"><Button onClick={() => openModal()}>+ New Token</Button></div>
            
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
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
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
                                <td className="px-6 py-4 text-right text-sm font-medium">
                                    <button onClick={() => verifyToken(t)} className="text-green-600 hover:text-green-900 mr-4" title="Verify Health">⚡</button>
                                    <button onClick={() => openModal(t)} className="text-blue-600 hover:text-blue-900 mr-4">Edit</button>
                                    <button onClick={() => setConfirmModal({ open: true, id: t.id })} className="text-red-600 hover:text-red-900">Delete</button>
                                </td>
                            </tr>
                        ))}
                        {tokens.length === 0 && <tr><td colSpan="8" className="p-8 text-center text-gray-400">No Data</td></tr>}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={modal.open} title={modal.isEdit ? "Edit Token" : "Create Token"} onClose={() => setModal({ open: false })} footer={
                <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setModal({ open: false })}>Cancel</Button><Button onClick={saveToken}>Save</Button></div>
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
                                <input 
                                    type="text" 
                                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-blue-500 focus:border-blue-500" 
                                    value={r.weight} 
                                    placeholder="Weight"
                                    onChange={e => {
                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                        const nr = [...form.routes]; 
                                        nr[i].weight = val; 
                                        setForm({ ...form, routes: nr });
                                    }} 
                                />
                                <button onClick={() => { const nr = [...form.routes]; nr.splice(i, 1); setForm({ ...form, routes: nr }); }} className="text-red-500 p-2">×</button>
                            </div>
                        ))}
                        <button onClick={() => setForm({ ...form, routes: [...form.routes, { channel_id: '', weight: 10 }] })} className="text-blue-600 text-sm">+ Add Route</button>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog isOpen={confirmModal.open} title="Confirm Delete" message="Are you sure?" onCancel={() => setConfirmModal({ open: false })} onConfirm={deleteToken} />

            <Modal isOpen={resultModal.open} title={resultModal.title || "Success"} onClose={() => setResultModal({ open: false })}>
                <div className={`p-4 rounded mb-4 ${resultModal.title?.includes('Issue') ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'}`}>
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono">{resultModal.content}</pre>
                </div>
                <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(resultModal.content);
                            alert('Copied to clipboard');
                        } else {
                            alert('Clipboard API not available (Non-HTTPS?). Please copy manually.');
                        }
                    }}>Copy</Button>
                    <Button onClick={() => setResultModal({ open: false })}>Close</Button>
                </div>
            </Modal>
        </div>
    );
};
