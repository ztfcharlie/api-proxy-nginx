const { useState, useEffect } = React;

window.ModelManager = ({ setNotify }) => {
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingModel, setEditingModel] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await window.api.models.list();
            setModels(res.data.data || []);
        } catch (e) {
            setNotify({ msg: 'Failed to load models', type: 'error' });
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
        
        // Collect providers
        const selectedProviders = [];
        ['openai', 'azure', 'vertex', 'anthropic', 'aws_bedrock', 'deepseek', 'qwen'].forEach(p => {
            if (data[`provider_${p}`] === 'on') selectedProviders.push(p);
            delete data[`provider_${p}`]; // cleanup
        });

        if (selectedProviders.length === 0) return setNotify({ msg: 'Please select at least one provider', type: 'error' });
        data.provider = JSON.stringify(selectedProviders);

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

    const renderProviders = (providerStr) => {
        try {
            const parsed = JSON.parse(providerStr);
            if (Array.isArray(parsed)) return parsed.map(p => <span key={p} className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs mr-1 uppercase border border-gray-200">{p.replace('_', ' ')}</span>);
            return <span className="uppercase">{providerStr}</span>;
        } catch (e) {
            return <span className="uppercase">{providerStr}</span>;
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
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Provider</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Input $</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Output $</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Request $</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Time $</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Cache $</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Def. RPM</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-right font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {models.map(m => (
                                <tr key={m.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{m.name}</td>
                                    <td className="px-4 py-3 text-gray-500 whitespace-normal max-w-xs leading-tight">{renderProviders(m.provider)}</td>
                                    <td className="px-4 py-3 text-gray-500 font-mono">{m.price_input > 0 ? m.price_input : '-'}</td>
                                    <td className="px-4 py-3 text-gray-500 font-mono">{m.price_output > 0 ? m.price_output : '-'}</td>
                                    <td className="px-4 py-3 text-gray-500 font-mono">{m.price_request > 0 ? m.price_request : '-'}</td>
                                    <td className="px-4 py-3 text-gray-500 font-mono">{m.price_time > 0 ? m.price_time : '-'}</td>
                                    <td className="px-4 py-3 text-gray-500 font-mono">{m.price_cache > 0 ? m.price_cache : '-'}</td>
                                    <td className="px-4 py-3 text-gray-500 font-mono">{m.default_rpm}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${m.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {m.status ? 'Active' : 'Disabled'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                                        <button onClick={()=>{setEditingModel(m);setShowModal(true)}} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                                        <button onClick={() => handleDelete(m.id)} className="text-red-600 hover:text-red-800 font-medium">Delete</button>
                                    </td>
                                </tr>
                            ))}
                            {models.length === 0 && !loading && <tr><td colSpan="10" className="px-6 py-8 text-center text-gray-400">No models found</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 fade-in px-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800">{editingModel ? 'Edit Model' : 'New Model'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {/* Row 1: Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                                <input name="name" defaultValue={editingModel?.name} required placeholder="e.g. gpt-4" className="w-full border rounded-lg px-3 py-2" />
                            </div>

                            {/* Row 2: Providers (Multi-select) */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Supported Providers</label>
                                <div className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                                    {['openai', 'azure', 'vertex', 'anthropic', 'aws_bedrock', 'deepseek', 'qwen'].map(p => {
                                        // Parse existing providers
                                        let isChecked = false;
                                        if (editingModel) {
                                            try {
                                                const parsed = JSON.parse(editingModel.provider);
                                                if (Array.isArray(parsed)) isChecked = parsed.includes(p);
                                                else isChecked = editingModel.provider === p; // legacy compatibility
                                            } catch (e) {
                                                isChecked = editingModel.provider === p;
                                            }
                                        } else {
                                            // Default for new: maybe none or openai?
                                            if (p === 'openai') isChecked = true;
                                        }
                                        
                                        return (
                                            <label key={p} className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer hover:bg-white p-1 rounded transition-colors">
                                                <input type="checkbox" name={`provider_${p}`} defaultChecked={isChecked} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                                                <span className="capitalize">{p.replace('_', ' ')}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            {/* Pricing Rows */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Input Price ($/1k)</label>
                                    <input type="number" step="0.000001" name="price_input" defaultValue={editingModel?.price_input || 0} className="w-full border rounded-lg px-3 py-2" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Output Price ($/1k)</label>
                                    <input type="number" step="0.000001" name="price_output" defaultValue={editingModel?.price_output || 0} className="w-full border rounded-lg px-3 py-2" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Cache Price ($/1k)</label>
                                    <input type="number" step="0.000001" name="price_cache" defaultValue={editingModel?.price_cache || 0} className="w-full border rounded-lg px-3 py-2" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Time Price ($/sec)</label>
                                    <input type="number" step="0.000001" name="price_time" defaultValue={editingModel?.price_time || 0} className="w-full border rounded-lg px-3 py-2" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Request Price ($/req)</label>
                                    <input type="number" step="0.000001" name="price_request" defaultValue={editingModel?.price_request || 0} className="w-full border rounded-lg px-3 py-2" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Default RPM</label>
                                    <input type="number" name="default_rpm" defaultValue={editingModel?.default_rpm || 1000} className="w-full border rounded-lg px-3 py-2" placeholder="1000" />
                                </div>
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