const { useState, useEffect, useRef } = React;

window.RedisInspector = ({ setNotify }) => {
    const [keys, setKeys] = useState([]);
    const [selectedKey, setSelectedKey] = useState(null);
    const [keyDetail, setKeyDetail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [pattern, setPattern] = useState('*');
    const [cursor, setCursor] = useState(0); // For pagination if needed

    // Load Keys
    const loadKeys = async (reset = true) => {
        setLoading(true);
        try {
            const currentCursor = reset ? 0 : cursor;
            // Use window.axios directly as window.api might not have redis exposed yet
            const res = await axios.get('/api/admin/redis/keys', { 
                params: { pattern, cursor: currentCursor, count: 200 } 
            });
            
            const newKeys = res.data.data || [];
            setKeys(reset ? newKeys : [...keys, ...newKeys]);
            setCursor(parseInt(res.data.cursor));
        } catch (e) {
            setNotify({ msg: 'Failed to scan keys: ' + e.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadKeys(); }, []);

    // Load Detail
    useEffect(() => {
        if (!selectedKey) {
            setKeyDetail(null);
            return;
        }
        const fetchDetail = async () => {
            setDetailLoading(true);
            try {
                const res = await axios.get('/api/admin/redis/key', { params: { key: selectedKey } });
                setKeyDetail(res.data);
            } catch (e) {
                setNotify({ msg: 'Failed to load key detail', type: 'error' });
            } finally {
                setDetailLoading(false);
            }
        };
        fetchDetail();
    }, [selectedKey]);

    const handleDelete = async () => {
        if (!selectedKey || !confirm(`Delete key ${selectedKey}?`)) return;
        try {
            await axios.delete('/api/admin/redis/key', { params: { key: selectedKey } });
            setNotify({ msg: 'Key deleted', type: 'success' });
            setKeyDetail(null);
            setSelectedKey(null);
            loadKeys(true); // Refresh list
        } catch (e) {
            setNotify({ msg: 'Delete failed', type: 'error' });
        }
    };

    const formatValue = (val) => {
        if (typeof val === 'object') return JSON.stringify(val, null, 2);
        try {
            return JSON.stringify(JSON.parse(val), null, 2);
        } catch (e) {
            return val;
        }
    };

    return (
        <div className="fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Redis Inspector</h1>
                    <p className="text-gray-500 text-sm">Inspect and manage cache keys</p>
                </div>
            </div>

            <div className="flex-1 flex gap-4 overflow-hidden border-t pt-4">
                {/* Left Panel: Key List */}
                <div className="w-1/3 flex flex-col border-r pr-4">
                    <div className="flex gap-2 mb-4">
                        <input 
                            className="flex-1 border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={pattern}
                            onChange={e => setPattern(e.target.value)}
                            placeholder="Pattern (e.g. oauth2:*)"
                            onKeyDown={e => e.key === 'Enter' && loadKeys(true)}
                        />
                        <button onClick={() => loadKeys(true)} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded border">
                            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                        {keys.map(k => (
                            <div key={k} 
                                onClick={() => setSelectedKey(k)}
                                className={`px-3 py-2 text-xs font-mono rounded cursor-pointer truncate transition-colors ${selectedKey === k ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'hover:bg-gray-50 text-gray-600'}`}
                                title={k}>
                                {k}
                            </div>
                        ))}
                        {keys.length === 0 && !loading && <div className="text-center text-gray-400 text-sm py-4">No keys found</div>}
                        {cursor !== 0 && (
                            <button onClick={() => loadKeys(false)} className="w-full text-center text-xs text-blue-500 py-2 hover:underline">
                                Load More...
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Panel: Detail */}
                <div className="flex-1 flex flex-col bg-gray-50 rounded-xl p-4 overflow-hidden relative border">
                    {!selectedKey ? (
                        <div className="flex items-center justify-center h-full text-gray-400">
                            <div className="text-center">
                                <i className="fas fa-database text-4xl mb-2"></i>
                                <p>Select a key to inspect</p>
                            </div>
                        </div>
                    ) : detailLoading ? (
                        <div className="flex items-center justify-center h-full"><i className="fas fa-spinner fa-spin text-2xl text-blue-500"></i></div>
                    ) : keyDetail ? (
                        <div className="flex flex-col h-full">
                            <div className="flex justify-between items-start mb-4 border-b pb-4">
                                <div className="overflow-hidden mr-4">
                                    <h3 className="text-sm font-bold text-gray-700 break-all font-mono">{keyDetail.key}</h3>
                                    <div className="flex gap-2 mt-2">
                                        <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs uppercase font-bold">{keyDetail.type}</span>
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${keyDetail.ttl > 0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                            TTL: {keyDetail.ttl === -1 ? 'None' : `${keyDetail.ttl}s`}
                                        </span>
                                    </div>
                                </div>
                                <button onClick={handleDelete} className="text-red-500 hover:text-red-700 px-3 py-1 border border-red-200 rounded bg-white hover:bg-red-50 text-sm">
                                    <i className="fas fa-trash-alt mr-1"></i> Delete
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden relative">
                                <textarea readOnly 
                                    className="w-full h-full p-3 bg-white border rounded font-mono text-xs text-gray-700 resize-none outline-none"
                                    value={formatValue(keyDetail.value)} />
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-red-500 mt-10">Key not found or expired</div>
                    )}
                </div>
            </div>
        </div>
    );
};