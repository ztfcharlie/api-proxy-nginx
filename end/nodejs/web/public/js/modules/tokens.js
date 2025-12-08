const { useState, useEffect } = React;

window.TokenManager = ({ setNotify }) => {
    const [tokens, setTokens] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingToken, setEditingToken] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const [resTokens, resUsers] = await Promise.all([
                window.api.tokens.list(),
                window.api.users.list()
            ]);
            setTokens(resTokens.data.data || []);
            setUsers(resUsers.data.data || []);
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
        data.status = formData.get('status') === 'on' ? 1 : 0;
        
        try {
            if(data.limit_config) data.limit_config = JSON.parse(data.limit_config);
        } catch(e) {
            return setNotify({ msg: 'Invalid Limit Config JSON', type: 'error' });
        }

        try {
            if (editingToken) {
                await window.api.tokens.update(editingToken.id, data);
                setNotify({ msg: 'Token updated', type: 'success' });
            } else {
                data.status = 1;
                await window.api.tokens.create(data);
                setNotify({ msg: 'Token created', type: 'success' });
            }
            setShowModal(false);
            load();
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
            setNotify({ msg: 'Delete failed', type: 'error' });
        }
    };

    return (
        <div className="fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Virtual Tokens</h1>
                    <p className="text-gray-500 text-sm">Manage access tokens for users</p>
                </div>
                <button onClick={() => { setEditingToken(null); setShowModal(true); }} 
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm">
                    <i className="fas fa-plus mr-2"></i>Issue Token
                </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Token Key</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">User</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {tokens.map(t => {
                            const user = users.find(u => u.id === t.user_id);
                            return (
                                <tr key={t.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-mono text-blue-600 truncate max-w-xs" title={t.token_key}>{t.token_key}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{user ? user.username : `User #${t.user_id}`}</td>
                                    <td className="px-6 py-4 text-sm"><span className="px-2 py-1 bg-gray-100 rounded text-xs uppercase">{t.type}</span></td>
                                    <td className="px-6 py-4 text-sm">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${t.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {t.status ? 'Active' : 'Disabled'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm space-x-2">
                                        <button onClick={() => { setEditingToken(t); setShowModal(true); }} className="text-blue-600 hover:text-blue-800">Edit</button>
                                        <button onClick={() => handleDelete(t.id)} className="text-red-600 hover:text-red-800">Delete</button>
                                    </td>
                                </tr>
                            );
                        })}
                        {tokens.length === 0 && !loading && <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-400">No tokens found</td></tr>}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 fade-in px-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800">{editingToken ? 'Edit Token' : 'Issue Token'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
                                <select name="user_id" defaultValue={editingToken?.user_id} required disabled={!!editingToken} className="w-full border rounded-lg px-3 py-2 bg-white">
                                    {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                    <select name="type" defaultValue={editingToken?.type || 'openai'} className="w-full border rounded-lg px-3 py-2 bg-white">
                                        <option value="openai">OpenAI / Generic</option>
                                        <option value="vertex">Vertex</option>
                                        <option value="azure">Azure</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Token Name (Remark)</label>
                                    <input name="name" defaultValue={editingToken?.name} placeholder="e.g. Test Token" className="w-full border rounded-lg px-3 py-2" />
                                </div>
                            </div>

                            {!editingToken && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Token Key (Optional)</label>
                                    <input name="token_key" placeholder="Leave blank to auto-generate" className="w-full border rounded-lg px-3 py-2 font-mono" />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Limit Config (JSON)</label>
                                <textarea name="limit_config" rows="3" 
                                    defaultValue={JSON.stringify(editingToken?.limit_config || {}, null, 2)}
                                    className="w-full border rounded-lg px-3 py-2 font-mono text-xs bg-gray-50" 
                                    placeholder='{ "allowed_models": ["gpt-4"], "rpm": 100 }'></textarea>
                            </div>

                            {editingToken && (
                                <div className="flex items-center space-x-2 pt-2">
                                    <input type="checkbox" name="status" id="statusCheck" defaultChecked={editingToken.status === 1} className="w-4 h-4 text-blue-600 rounded" />
                                    <label htmlFor="statusCheck" className="text-sm font-medium text-gray-700">Token Active</label>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};