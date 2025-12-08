const { useState, useEffect } = React;

window.ModelManager = ({ setNotify }) => {
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingModel, setEditingModel] = useState(null);

    const load = async () => {
        setLoading(true);
        try { const res = await window.api.models.list(); setModels(res.data.data || []); } catch (e) { setNotify({ msg: 'Failed to load models', type: 'error' }); } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        data.status = data.status === 'on' ? 1 : 0;
        try {
            if(editingModel) await window.api.models.update(editingModel.id, data);
            else { data.status = 1; await window.api.models.create(data); }
            setShowModal(false); load(); setNotify({msg: 'Saved', type: 'success'});
        } catch(e) { setNotify({msg: 'Error', type: 'error'}); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this model?')) return;
        try {
            await window.api.models.delete(id);
            setNotify({ msg: 'Model deleted', type: 'success' });
            load();
        } catch (err) {
            setNotify({ msg: 'Delete failed', type: 'error' });
        }
    };

    return (
        <div className="fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Models</h1>
                    <p className="text-gray-500 text-sm">Manage supported models and pricing</p>
                </div>
                <button onClick={()=>{setEditingModel(null);setShowModal(true)}} 
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm">
                    <i className="fas fa-plus mr-2"></i>New Model
                </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Provider</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Input $</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Output $</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {models.map(m => (
                            <tr key={m.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{m.name}</td>
                                <td className="px-6 py-4 text-sm text-gray-500 uppercase">{m.provider}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">${m.price_input}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">${m.price_output}</td>
                                <td className="px-6 py-4 text-sm">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${m.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {m.status ? 'Active' : 'Disabled'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right text-sm space-x-2">
                                    <button onClick={()=>{setEditingModel(m);setShowModal(true)}} className="text-blue-600 hover:text-blue-800">Edit</button>
                                    <button onClick={() => handleDelete(m.id)} className="text-red-600 hover:text-red-800">Delete</button>
                                </td>
                            </tr>
                        ))}
                        {models.length === 0 && !loading && <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-400">No models found</td></tr>}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 fade-in px-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800">{editingModel ? 'Edit Model' : 'New Model'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                                    <select name="provider" defaultValue={editingModel?.provider || 'openai'} className="w-full border rounded-lg px-3 py-2 bg-white">
                                        <option value="openai">OpenAI</option>
                                        <option value="google">Google</option>
                                        <option value="anthropic">Anthropic</option>
                                        <option value="azure">Azure</option>
                                        <option value="deepseek">DeepSeek</option>
                                        <option value="qwen">Qwen</option>
                                        <option value="aws_bedrock">AWS Bedrock</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                                    <input name="name" defaultValue={editingModel?.name} required placeholder="e.g. gpt-4" className="w-full border rounded-lg px-3 py-2" />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Input Price ($/1k tokens)</label>
                                    <input type="number" step="0.000001" name="price_input" defaultValue={editingModel?.price_input || 0} className="w-full border rounded-lg px-3 py-2" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Output Price ($/1k tokens)</label>
                                    <input type="number" step="0.000001" name="price_output" defaultValue={editingModel?.price_output || 0} className="w-full border rounded-lg px-3 py-2" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Request Price ($/req)</label>
                                <input type="number" step="0.000001" name="price_request" defaultValue={editingModel?.price_request || 0} className="w-full border rounded-lg px-3 py-2" />
                            </div>

                            {editingModel && (
                                <div className="flex items-center space-x-2 pt-2">
                                    <input type="checkbox" name="status" id="statusCheck" defaultChecked={editingModel.status === 1} className="w-4 h-4 text-blue-600 rounded" />
                                    <label htmlFor="statusCheck" className="text-sm font-medium text-gray-700">Model Active</label>
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