const { useState, useEffect, useMemo } = React;

window.ModelManager = ({ setNotify }) => {
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingModel, setEditingModel] = useState(null);
    
    // Filter & Sort States
    const [searchTerm, setSearchTerm] = useState('');
    const [filterProvider, setFilterProvider] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

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
        data.is_async = data.is_async === 'on' ? 1 : 0; // [Added] Handle async flag
        
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
        } catch(e) { 
            setNotify({ msg: e.response?.data?.error || e.message || 'Operation failed', type: 'error' }); 
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this model?')) return;
        try {
            await window.api.models.delete(id);
            setNotify({ msg: 'Model deleted', type: 'success' });
            load();
        } catch (err) {
            setNotify({ msg: err.response?.data?.error || err.message || 'Delete failed', type: 'error' });
        }
    };

    const renderProviders = (providerStr) => {
        try {
            const parsed = JSON.parse(providerStr);
            if (Array.isArray(parsed)) return (
                <div className="flex flex-wrap gap-1">
                    {parsed.map(p => (
                        <span key={p} className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs uppercase border border-gray-200 whitespace-nowrap">
                            {p.replace('_', ' ')}
                        </span>
                    ))}
                </div>
            );
            return <span className="uppercase">{providerStr}</span>;
        } catch (e) {
            return <span className="uppercase">{providerStr}</span>;
        }
    };

    // Filter and Sort Logic
    const processedModels = useMemo(() => {
        let result = [...models];

        // 1. Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(m => m.name.toLowerCase().includes(lower));
        }
        if (filterProvider) {
            result = result.filter(m => {
                try {
                    const parsed = JSON.parse(m.provider);
                    return Array.isArray(parsed) ? parsed.includes(filterProvider) : m.provider === filterProvider;
                } catch { return m.provider === filterProvider; }
            });
        }

        // 2. Sort
        if (sortConfig.key) {
            result.sort((a, b) => {
                let valA = a[sortConfig.key];
                let valB = b[sortConfig.key];
                
                // Special handling for numeric sorting if needed, but names are strings
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [models, searchTerm, filterProvider, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <i className="fas fa-sort text-gray-300 ml-1"></i>;
        return <i className={`fas fa-sort-${sortConfig.direction === 'asc' ? 'up' : 'down'} text-blue-500 ml-1`}></i>;
    };

    return (
        <div className="fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Models</h1>
                    <p className="text-gray-500 text-sm">Manage supported models and pricing</p>
                </div>
                <div className="flex space-x-3">
                    <input 
                        type="text" 
                        placeholder="Search models..." 
                        className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-64"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <select 
                        className="border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={filterProvider}
                        onChange={e => setFilterProvider(e.target.value)}
                    >
                        <option value="">All Providers</option>
                        {['openai', 'azure', 'vertex', 'anthropic', 'aws_bedrock', 'deepseek', 'qwen'].map(p => (
                            <option key={p} value={p}>{p.replace('_', ' ').toUpperCase()}</option>
                        ))}
                    </select>
                    <button onClick={()=>{setEditingModel(null);setShowModal(true)}} 
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm flex items-center">
                        <i className="fas fa-plus mr-2"></i>New Model
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 overflow-y-auto">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name')}>
                                    Name <SortIcon column="name" />
                                </th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('provider')}>
                                    Provider <SortIcon column="provider" />
                                </th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Input (1M)</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Output (1M)</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Request $</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Time $</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Cache (1M)</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Def. RPM</th>
                                <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-right font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {processedModels.map(m => (
                                <tr key={m.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap flex items-center">
                                        {m.name}
                                        {m.is_async === 1 && <i className="fas fa-bolt text-purple-500 ml-2" title="Async Task Model"></i>}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 whitespace-normal max-w-xs leading-tight">
                                        {renderProviders(m.provider)}
                                    </td>
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
                            {processedModels.length === 0 && !loading && <tr><td colSpan="10" className="px-6 py-8 text-center text-gray-400">No models found</td></tr>}
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
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Input Price ($/1M)</label>
                                    <input type="number" step="0.000001" name="price_input" defaultValue={editingModel?.price_input || 0} className="w-full border rounded-lg px-3 py-2" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Output Price ($/1M)</label>
                                            <input type="number" step="0.000001" name="price_output" defaultValue={editingModel?.price_output || 0} className="w-full border rounded-lg px-3 py-2" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Cache Price ($/1M)</label>
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

                                    {/* Status & Async Flags */}
                                    <div className="flex items-center space-x-6 pt-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                                        <div className="flex items-center space-x-2">
                                            <input type="checkbox" name="status" id="statusCheck" defaultChecked={editingModel ? editingModel.status === 1 : true} className="w-4 h-4 text-blue-600 rounded" />
                                            <label htmlFor="statusCheck" className="text-sm font-medium text-gray-700">Active</label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <input type="checkbox" name="is_async" id="asyncCheck" defaultChecked={editingModel ? editingModel.is_async === 1 : false} className="w-4 h-4 text-purple-600 rounded" />
                                            <label htmlFor="asyncCheck" className="text-sm font-medium text-gray-700 flex items-center">
                                                Async Task <i className="fas fa-bolt ml-1 text-xs text-purple-500" title="Enable for video/audio generation tasks"></i>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 mt-4">
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