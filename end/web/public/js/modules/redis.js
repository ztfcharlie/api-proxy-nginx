const { useState, useEffect } = React;
const { Button, Input } = window.UI;

window.Modules = window.Modules || {};

window.Modules.Redis = () => {
    const [keys, setKeys] = useState([]);
    const [selectedKey, setSelectedKey] = useState(null);
    const [keyData, setKeyData] = useState(null);
    const [filter, setFilter] = useState('');
    const [loading, setLoading] = useState(false);

    const API_BASE = '/api/admin/redis';

    useEffect(() => {
        fetchKeys();
    }, []);

    const fetchKeys = async () => {
        setLoading(true);
        try {
            const res = await axios.get(API_BASE + '/keys');
            setKeys(res.data.data);
        } catch (e) { alert('Fetch keys failed'); }
        setLoading(false);
    };

    const selectKey = async (key) => {
        setSelectedKey(key);
        try {
            const res = await axios.get(API_BASE + '/value', { params: { key } });
            setKeyData(res.data.data);
        } catch (e) { alert('Fetch value failed'); }
    };

    const deleteKey = async () => {
        if (!confirm('Are you sure?')) return;
        try {
            await axios.delete(API_BASE + '/key', { params: { key: selectedKey } });
            setKeyData(null);
            setSelectedKey(null);
            fetchKeys();
        } catch (e) { alert('Delete failed'); }
    };

    const filteredKeys = keys.filter(k => k.toLowerCase().includes(filter.toLowerCase()));

    return (
        <div className="flex h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden" style={{ minHeight: '600px' }}>
            {/* Left: Key List */}
            <div className="w-1/3 border-r bg-gray-50 flex flex-col">
                <div className="p-4 border-b">
                    <div className="flex gap-2">
                        <input 
                            className="w-full px-3 py-2 border rounded text-sm" 
                            placeholder="Filter keys..." 
                            value={filter} 
                            onChange={e => setFilter(e.target.value)} 
                        />
                        <Button onClick={fetchKeys} size="sm">Refresh</Button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {filteredKeys.map(key => (
                        <div 
                            key={key} 
                            onClick={() => selectKey(key)}
                            className={`px-4 py-2 text-sm cursor-pointer truncate font-mono hover:bg-blue-50 ${selectedKey === key ? 'bg-blue-100 text-blue-700 border-r-4 border-blue-500' : 'text-gray-600'}`}
                        >
                            {key}
                        </div>
                    ))}
                    {filteredKeys.length === 0 && <div className="p-4 text-center text-gray-400 text-sm">No keys found</div>}
                </div>
            </div>

            {/* Right: Value Viewer */}
            <div className="w-2/3 flex flex-col">
                {selectedKey ? (
                    <>
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-gray-800 font-mono text-lg">{selectedKey}</h3>
                                <div className="text-xs text-gray-500 mt-1 flex gap-4">
                                    <span>Type: <span className="font-bold uppercase">{keyData?.type}</span></span>
                                    <span>TTL: <span className={`font-bold ${keyData?.ttl < 0 ? 'text-red-500' : 'text-green-600'}`}>{keyData?.ttl}s</span></span>
                                </div>
                            </div>
                            <Button variant="danger" onClick={deleteKey}>Delete Key</Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 bg-slate-900 text-slate-300 font-mono text-sm">
                            <pre className="whitespace-pre-wrap break-words">
                                {keyData ? JSON.stringify(keyData.value, null, 2) : 'Loading...'}
                            </pre>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400">
                        Select a key to view details
                    </div>
                )}
            </div>
        </div>
    );
};
