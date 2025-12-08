const { useState, useEffect } = React;

window.TokenManager = ({ setNotify }) => {
    const [tokens, setTokens] = useState([]);
    const [users, setUsers] = useState([]);
    const [channels, setChannels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingToken, setEditingToken] = useState(null);
    const [successData, setSuccessData] = useState(null);
    
    // Filter States
    const [filterUser, setFilterUser] = useState('');
    const [filterType, setFilterType] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const params = { limit: 100 };
            if (filterUser) params.user_id = filterUser;
            if (filterType) params.type = filterType;

            const [resTokens, resUsers, resChannels] = await Promise.all([
                window.api.tokens.list(params),
                window.api.users.list(),
                window.api.channels.list({ limit: 1000, status: 1 })
            ]);
            setTokens(resTokens.data.data || []);
            setUsers(resUsers.data.data || []);
            setChannels(resChannels.data.data || []);
        } catch (e) {
            setNotify({ msg: 'Failed to load data', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [filterUser, filterType]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.status = formData.get('status') === 'on' ? 1 : 0;
        
        try {
            if(data.limit_config && data.limit_config.trim()) {
                data.limit_config = JSON.parse(data.limit_config);
            } else {
                data.limit_config = {};
            }
        } catch(e) {
            return setNotify({ msg: 'Invalid Limit Config JSON', type: 'error' });
        }

        // Collect Routes
        const routes = [];
        channels.forEach(ch => {
            if (formData.get(`channel_${ch.id}`) === 'on') {
                const weight = parseInt(formData.get(`weight_${ch.id}`) || 10);
                routes.push({ channel_id: ch.id, weight });
            }
        });

        if (routes.length === 0) {
            return setNotify({ msg: 'Please bind at least one channel', type: 'error' });
        }
        data.routes = routes;

        try {
            let res;
            if (editingToken) {
                await window.api.tokens.update(editingToken.id, data);
                setNotify({ msg: 'Token updated', type: 'success' });
                setShowModal(false);
                load();
            } else {
                data.status = 1;
                res = await window.api.tokens.create(data);
                setNotify({ msg: 'Token created', type: 'success' });
                setShowModal(false);
                setSuccessData(res.data);
                load();
            }
        } catch (err) {
            setNotify({ msg: err.response?.data?.error || 'Operation failed', type: 'error' });
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this token?')) return;
        try {
            await window.api.tokens.delete(id);
            setNotify({ msg: 'Token deleted', type: 'success' });
            load();
        } catch (err) {
            setNotify({ msg: err.response?.data?.error || 'Delete failed', type: 'error' });
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            setNotify({ msg: 'Copied to clipboard', type: 'success' });
        });
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Never';
        return new Date(dateStr).toLocaleString();
    };

    const SuccessModal = ({ data, onClose }) => {
        if (!data) return null;
        const isVertex = data.credentials && data.credentials.type === 'service_account';
        const keyDisplay = isVertex ? JSON.stringify(data.credentials, null, 2) : data.credentials?.api_key;

        const download = () => {
            const blob = new Blob([keyDisplay], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = isVertex ? 'vertex-key.json' : 'api-key.txt';
            a.click();
        };

        return (
            <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 fade-in px-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 text-center">
                    <div className="mb-4">
                        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                            <i className="fas fa-check text-green-600 text-xl"></i>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Token Generated</h3>
                        <p className="text-sm text-gray-500 mt-2">Please save this credential now.</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg border text-left overflow-auto max-h-60 mb-6">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all select-all">{keyDisplay}</pre>
                    </div>
                    <div className="flex justify-center gap-3">
                        <button onClick={download} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><i className="fas fa-download mr-2"></i>Download</button>
                        <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Close</button>
                    </div>
                </div>
            </div>
        );
    };

    const TokenForm = ({ token, channels, users, onSubmit, onCancel }) => {
        const [type, setType] = useState(token?.type || 'openai');
        const compatibleChannels = channels.filter(ch => ch.type === type);

        return (
            <form onSubmit={onSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
                        <select name="user_id" defaultValue={token?.user_id} required disabled={!!token} className="w-full border rounded-lg px-3 py-2 bg-white">
                            {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                        <select name="type" value={type} onChange={e => setType(e.target.value)} disabled={!!token} className="w-full border rounded-lg px-3 py-2 bg-white">
                            <option value="openai">OpenAI</option>
                            <option value="vertex">Vertex</option>
                            <option value="azure">Azure</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="aws_bedrock">AWS Bedrock</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name (Remark)</label>
                    <input name="name" defaultValue={token?.name} placeholder="e.g. Production Key" required className="w-full border rounded-lg px-3 py-2" />
                </div>

                {token && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Token Key</label>
                        <input value={token.token_key} readOnly className="w-full border rounded-lg px-3 py-2 bg-gray-50 font-mono text-gray-500" />
                    </div>
                )}

                <div className="border rounded-lg p-4 bg-gray-50">
                    <label className="block text-sm font-bold text-gray-700 mb-3">Bind Channels (Load Balancing)</label>
                    {compatibleChannels.length === 0 ? (
                        <div className="text-sm text-red-500 bg-white p-3 rounded border">No active channels found for <strong>{type}</strong>.</div>
                    ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {compatibleChannels.map(ch => {
                                const existingRoute = token?.routes?.find(r => r.channel_id === ch.id);
                                return (
                                    <div key={ch.id} className="flex items-center justify-between bg-white p-2 rounded border hover:border-blue-300 transition-colors">
                                        <label className="flex items-center space-x-3 cursor-pointer flex-1">
                                            <input type="checkbox" name={`channel_${ch.id}`} defaultChecked={!!existingRoute} className="w-4 h-4 text-blue-600 rounded" />
                                            <span className="text-sm font-medium text-gray-700">{ch.name}</span>
                                            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 rounded">#{ch.id}</span>
                                        </label>
                                        <div className="flex items-center space-x-2 ml-4">
                                            <span className="text-xs text-gray-400">Weight</span>
                                            <input type="number" name={`weight_${ch.id}`} defaultValue={existingRoute ? existingRoute.weight : 10} className="w-16 border rounded px-2 py-1 text-xs text-center" min="1" max="100" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Limit Config (JSON)</label>
                    <textarea name="limit_config" rows="2" defaultValue={JSON.stringify(token?.limit_config || {}, null, 2)} className="w-full border rounded-lg px-3 py-2 font-mono text-xs bg-gray-50" placeholder='{ "allowed_models": ["gpt-4"], "qps": 10 }'></textarea>
                </div>

                {token && (
                    <div className="flex items-center space-x-2 pt-2">
                        <input type="checkbox" name="status" id="statusCheck" defaultChecked={token.status === 1} className="w-4 h-4 text-blue-600 rounded" />
                        <label htmlFor="statusCheck" className="text-sm font-medium text-gray-700">Token Active</label>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onCancel} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
                </div>
            </form>
        );
    };

    return (
        <div className="fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div><h1 className="text-2xl font-bold text-gray-800">Virtual Tokens</h1><p className="text-gray-500 text-sm">Manage access tokens</p></div>
                <div className="flex space-x-3">
                    <select className="border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                        <option value="">All Users</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                    </select>
                    <select className="border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={filterType} onChange={e => setFilterType(e.target.value)}>
                        <option value="">All Types</option><option value="openai">OpenAI</option><option value="vertex">Vertex</option><option value="azure">Azure</option>
                    </select>
                    <button onClick={() => { setEditingToken(null); setShowModal(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm"><i className="fas fa-plus mr-2"></i>Issue Token</button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">User</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Token Key</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Created</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {tokens.map(t => {
                            const user = users.find(u => u.id === t.user_id);
                            const isVertex = t.type === 'vertex';
                            const keyDisplay = isVertex ? 'JSON Key' : (t.token_key.length > 10 ? t.token_key.substring(0, 3) + '...' + t.token_key.substring(t.token_key.length - 3) : t.token_key);
                            return (
                                <tr key={t.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{t.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{user ? user.username : `ID:${t.user_id}`}</td>
                                    <td className="px-6 py-4 text-sm"><span className="px-2 py-1 bg-gray-100 rounded text-xs uppercase font-bold text-gray-600">{t.type}</span></td>
                                    <td className="px-6 py-4 text-sm font-mono text-gray-500">
                                        <div className="flex items-center space-x-2">
                                            <span className={isVertex ? "bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-100 text-xs" : ""}>{keyDisplay}</span>
                                            <button onClick={() => copyToClipboard(t.token_key)} className="text-gray-400 hover:text-blue-600 transition-colors" title="Copy Full Key"><i className="far fa-copy"></i></button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-gray-500">{formatDate(t.created_at)}</td>
                                    <td className="px-6 py-4 text-sm">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${t.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.status ? 'Active' : 'Disabled'}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm space-x-2">
                                        <button onClick={() => { setEditingToken(t); setShowModal(true); }} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                                        <button onClick={() => handleDelete(t.id)} className="text-red-600 hover:text-red-800 font-medium">Del</button>
                                    </td>
                                </tr>
                            );
                        })}
                        {tokens.length === 0 && !loading && <tr><td colSpan="7" className="px-6 py-12 text-center text-gray-400 italic">No tokens found</td></tr>}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 fade-in px-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800">{editingToken ? 'Edit Token' : 'Issue Token'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            <TokenForm token={editingToken} channels={channels} users={users} onSubmit={handleSubmit} onCancel={() => setShowModal(false)} />
                        </div>
                    </div>
                </div>
            )}

            {successData && <SuccessModal data={successData} onClose={() => setSuccessData(null)} />}
        </div>
    );
};