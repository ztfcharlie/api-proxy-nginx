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
    const [filterSearch, setFilterSearch] = useState(''); // Name or Key
    const [filterChannel, setFilterChannel] = useState(''); // Channel ID

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            load();
        }, 500);
        return () => clearTimeout(timer);
    }, [filterUser, filterType, filterSearch, filterChannel]);

    const load = async () => {
        setLoading(true);
        try {
            const params = { limit: 100 };
            if (filterUser) params.username = filterUser;
            if (filterType) params.type = filterType;
            if (filterSearch) params.search = filterSearch;
            if (filterChannel) params.channel_id = filterChannel;

            const [resTokens, resChannels, resUsers] = await Promise.all([
                window.api.tokens.list(params),
                window.api.channels.list({ limit: 1000, status: 1 }),
                window.api.users.list() // Preload for form
            ]);
            setTokens(resTokens.data.data || []);
            setChannels(resChannels.data.data || []);
            setUsers(resUsers.data.data || []);
        } catch (e) {
            setNotify({ msg: 'Failed to load data', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

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
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => setNotify({ msg: 'Copied', type: 'success' }));
        } else {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed"; textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus(); textArea.select();
            try { document.execCommand('copy'); setNotify({ msg: 'Copied', type: 'success' }); } catch (err) {}
            document.body.removeChild(textArea);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Never';
        return new Date(dateStr).toLocaleDateString();
    };

    const SuccessModal = ({ data, onClose }) => { /* ... same as before ... */
        if (!data) return null;
        const isVertex = data.credentials && data.credentials.type === 'service_account';
        const keyDisplay = isVertex ? JSON.stringify(data.credentials, null, 2) : data.credentials?.api_key;
        const download = () => {
            const blob = new Blob([keyDisplay], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = isVertex ? 'vertex-key.json' : 'api-key.txt'; a.click();
        };
        return (
            <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 fade-in px-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 text-center">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Token Generated</h3>
                    <div className="bg-gray-50 p-4 rounded-lg border text-left overflow-auto max-h-60 mb-6">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all select-all">{keyDisplay}</pre>
                    </div>
                    <div className="flex justify-center gap-3">
                        <button onClick={() => copyToClipboard(keyDisplay)} className="px-4 py-2 border rounded">Copy</button>
                        <button onClick={download} className="px-4 py-2 bg-blue-600 text-white rounded">Download</button>
                        <button onClick={onClose} className="px-4 py-2 border rounded">Close</button>
                    </div>
                </div>
            </div>
        );
    };

    const TokenForm = ({ token, channels, users, onSubmit, onCancel }) => { /* ... same as before ... */
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
                            <option value="openai">OpenAI</option><option value="vertex">Vertex</option><option value="azure">Azure</option><option value="anthropic">Anthropic</option><option value="aws_bedrock">AWS Bedrock</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input name="name" defaultValue={token?.name} required className="w-full border rounded-lg px-3 py-2" />
                </div>
                {/* Channel List */}
                <div className="border rounded-lg p-4 bg-gray-50">
                    <label className="block text-sm font-bold text-gray-700 mb-3">Bind Channels</label>
                    {compatibleChannels.length === 0 ? <div className="text-sm text-red-500">No active channels found.</div> : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {compatibleChannels.map(ch => {
                                const existingRoute = token?.routes?.find(r => r.channel_id === ch.id);
                                return (
                                    <div key={ch.id} className="flex items-center justify-between bg-white p-2 rounded border">
                                        <label className="flex items-center space-x-3 cursor-pointer flex-1">
                                            <input type="checkbox" name={`channel_${ch.id}`} defaultChecked={!!existingRoute} className="w-4 h-4" />
                                            <span className="text-sm">{ch.name} <span className="text-xs text-gray-400">#{ch.id}</span></span>
                                        </label>
                                        <div className="flex items-center space-x-2 ml-4">
                                            <span className="text-xs text-gray-400">W:</span>
                                            <input type="number" name={`weight_${ch.id}`} defaultValue={existingRoute ? existingRoute.weight : 10} className="w-12 border rounded px-1 text-center text-xs" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Limit Config</label>
                    <textarea name="limit_config" rows="2" defaultValue={JSON.stringify(token?.limit_config || {}, null, 2)} className="w-full border rounded-lg px-3 py-2 font-mono text-xs" placeholder='{}'></textarea>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onCancel} className="px-4 py-2 border rounded">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
                </div>
            </form>
        );
    };

    return (
        <div className="fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Virtual Tokens</h1>
                    <p className="text-gray-500 text-sm">Manage access tokens for users</p>
                </div>
                <div className="flex space-x-3">
                    <input type="text" placeholder="Search User..." className="border rounded-lg px-3 py-2 text-sm w-32" value={filterUser} onChange={e => setFilterUser(e.target.value)} />
                    <input type="text" placeholder="Search Name/Key..." className="border rounded-lg px-3 py-2 text-sm w-40" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
                    <input type="text" placeholder="Channel ID..." className="border rounded-lg px-3 py-2 text-sm w-24" value={filterChannel} onChange={e => setFilterChannel(e.target.value)} />
                    
                    <select className="border rounded-lg px-3 py-2 text-sm bg-white" value={filterType} onChange={e => setFilterType(e.target.value)}>
                        <option value="">All Types</option><option value="openai">OpenAI</option><option value="vertex">Vertex</option>
                    </select>
                    <button onClick={() => { setEditingToken(null); setShowModal(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm">Issue</button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">User</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Routes (Channels)</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Token Key</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Created</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {tokens.map(t => {
                            const isVertex = t.type === 'vertex';
                            const keyDisplay = isVertex ? 'JSON Key' : (t.token_key.length > 10 ? t.token_key.substring(0, 3) + '...' + t.token_key.substring(t.token_key.length - 3) : t.token_key);
                            
                            return (
                                <tr key={t.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{t.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        <div className="flex items-center">
                                            <span className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold mr-2">{(t.username||'U')[0]}</span>
                                            {t.username}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        <div className="flex flex-col gap-1">
                                            {t.routes && t.routes.length > 0 ? t.routes.map(r => (
                                                <span key={r.channel_id} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded border border-gray-200 whitespace-nowrap">
                                                    {r.channel_name} <span className="text-gray-400">#{r.channel_id}</span> <span className="text-blue-500 font-bold">[{r.weight}]</span>
                                                </span>
                                            )) : <span className="text-red-400 text-xs">No Routes</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-mono text-gray-500">
                                        <div className="flex items-center space-x-2">
                                            <span>{keyDisplay}</span>
                                            <button onClick={() => copyToClipboard(t.token_key)} className="text-gray-400 hover:text-blue-600"><i className="far fa-copy"></i></button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-gray-500">{formatDate(t.created_at)}</td>
                                    <td className="px-6 py-4 text-sm"><span className={`px-2 py-1 rounded-full text-xs font-bold ${t.status ? 'bg-green-100 text-green-700' : 'bg-red-100'}`}>{t.status ? 'Active' : 'Disabled'}</span></td>
                                    <td className="px-6 py-4 text-right text-sm space-x-2">
                                        <button onClick={() => { setEditingToken(t); setShowModal(true); }} className="text-blue-600 font-medium">Edit</button>
                                        <button onClick={() => handleDelete(t.id)} className="text-red-600 font-medium">Del</button>
                                    </td>
                                </tr>
                            );
                        })}
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