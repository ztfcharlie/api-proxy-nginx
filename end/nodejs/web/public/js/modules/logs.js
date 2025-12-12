const { useState, useEffect } = React;
const axios = window.axios;

window.LogViewer = ({ setNotify }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [selectedLog, setSelectedLog] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Filters
    const [filterModel, setFilterModel] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const load = async (p = 1) => {
        setLoading(true);
        try {
            const params = { page: p, limit: 20 };
            if (filterModel) params.model = filterModel;
            if (filterStatus) params.status = filterStatus;

            const res = await window.api.logs.list(params);
            setLogs(res.data.data || []);
            setTotal(res.data.pagination.total);
            setPage(p);
        } catch (e) {
            setNotify({ msg: 'Failed to load logs', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(1); }, []);

    const handleSearch = () => load(1);
    const handleKeyDown = (e) => { if(e.key === 'Enter') load(1); };

    const viewDetail = async (log) => {
        setSelectedLog(log); // Show modal immediately with summary
        setDetailLoading(true);
        try {
            const res = await axios.get(`/api/admin/logs/${log.id}`);
            setSelectedLog(res.data.data);
        } catch (e) {
            setNotify({ msg: 'Failed to load detail', type: 'error' });
        } finally {
            setDetailLoading(false);
        }
    };

    const LogDetailModal = ({ log, onClose }) => {
        if (!log) return null;
        return (
            <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 fade-in px-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                    <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                        <h3 className="text-lg font-bold text-gray-800">Request Detail <span className="text-gray-400 text-sm">#{log.request_id}</span></h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                    </div>
                    <div className="p-6 overflow-y-auto flex-1 space-y-6">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                            <div><span className="font-bold text-gray-500">Time:</span> {new Date(log.created_at).toLocaleString()}</div>
                            <div><span className="font-bold text-gray-500">Model:</span> {log.model}</div>
                            <div><span className="font-bold text-gray-500">Status:</span> <span className={log.status_code===200?'text-green-600':'text-red-600 font-bold'}>{log.status_code}</span></div>
                            <div><span className="font-bold text-gray-500">Duration:</span> {log.duration_ms}ms</div>
                            <div><span className="font-bold text-gray-500">Upstream:</span> {log.upstream_duration_ms}ms</div>
                            <div><span className="font-bold text-gray-500">Input Tokens:</span> {log.prompt_tokens}</div>
                            <div><span className="font-bold text-gray-500">Output Tokens:</span> {log.completion_tokens}</div>
                            <div><span className="font-bold text-gray-500">Total Tokens:</span> {log.total_tokens}</div>
                            <div><span className="font-bold text-gray-500">Cost:</span> ${log.cost}</div>
                            <div className="col-span-2"><span className="font-bold text-gray-500">IP/UA:</span> {log.ip} <span className="text-xs text-gray-400 block truncate">{log.user_agent}</span></div>
                        </div>

                        {detailLoading ? (
                            <div className="text-center py-10"><i className="fas fa-spinner fa-spin text-2xl text-blue-500"></i></div>
                        ) : (
                            <>
                                <div>
                                    <h4 className="font-bold text-gray-700 mb-2 border-b pb-1">Request Body</h4>
                                    <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-auto max-h-60 whitespace-pre-wrap">{log.req_body || '(empty/truncated)'}</pre>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-700 mb-2 border-b pb-1">Response Body</h4>
                                    <pre className="bg-gray-900 text-blue-400 p-4 rounded-lg text-xs font-mono overflow-auto max-h-60 whitespace-pre-wrap">{log.res_body || '(empty/truncated)'}</pre>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="px-6 py-4 border-t flex justify-end">
                        <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Close</button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Request Logs</h1>
                    <p className="text-gray-500 text-sm">View API usage history</p>
                </div>
                <div className="flex space-x-2">
                    <input type="text" placeholder="Model..." className="border rounded-lg px-3 py-2 text-sm w-32 outline-none focus:ring-2 focus:ring-blue-500" 
                        value={filterModel} onChange={e => setFilterModel(e.target.value)} onKeyDown={handleKeyDown} />
                    <input type="number" placeholder="Status..." className="border rounded-lg px-3 py-2 text-sm w-24 outline-none focus:ring-2 focus:ring-blue-500" 
                        value={filterStatus} onChange={e => setFilterStatus(e.target.value)} onKeyDown={handleKeyDown} />
                    <button onClick={handleSearch} className="px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 border border-blue-200">
                        <i className={`fas fa-search ${loading ? 'fa-spin' : ''}`}></i>
                    </button>
                    <button onClick={() => load(1)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 ml-2">
                        <i className="fas fa-sync-alt mr-2"></i>Refresh
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Time</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Model</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">User</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Token</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Status</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Duration</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Cost</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Tokens (In/Out/Total)</th>
                            <th className="px-6 py-3 text-right font-bold text-gray-500">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {logs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                                <td className="px-6 py-4 font-medium text-gray-900">{log.model}</td>
                                <td className="px-6 py-4 text-gray-600 font-bold text-xs">{log.username || `UID: ${log.user_id}`}</td>
                                <td className="px-6 py-4 text-gray-600">
                                    <div className="truncate w-24 font-mono text-xs" title={log.token_key}>
                                        {log.token_name || (log.token_key ? log.token_key.substring(0, 10) + '...' : '-')}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${log.status_code === 200 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {log.status_code}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-500">{log.duration_ms}ms</td>
                                <td className="px-6 py-4 text-gray-900 font-bold">${parseFloat(log.cost).toFixed(6)}</td>
                                <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                                    <span className="text-blue-600" title="Input">{log.prompt_tokens}</span> / 
                                    <span className="text-green-600" title="Output">{log.completion_tokens}</span> / 
                                    <span className="font-bold">{log.total_tokens}</span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => viewDetail(log)} className="text-blue-600 hover:underline">View</button>
                                </td>
                            </tr>
                        ))}
                        {logs.length === 0 && !loading && <tr><td colSpan="7" className="px-6 py-8 text-center text-gray-400">No logs found</td></tr>}
                    </tbody>
                </table>
            </div>
            <div className="py-4 flex justify-between items-center text-sm text-gray-600">
                <div>Total: {total}</div>
                <div className="space-x-2">
                    <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50">Prev</button>
                    <span className="mx-2">Page {page}</span>
                    <button onClick={() => load(page + 1)} className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50" disabled={logs.length < 20}>Next</button>
                </div>
            </div>

            {selectedLog && <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
        </div>
    );
};