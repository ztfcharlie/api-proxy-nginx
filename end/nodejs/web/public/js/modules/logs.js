const { useState, useEffect } = React;

window.LogViewer = ({ setNotify }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    const load = async (p = 1) => {
        setLoading(true);
        try {
            const res = await window.api.logs.list({ page: p, limit: 20 });
            setLogs(res.data.data || []);
            setTotal(res.data.pagination.total);
            setPage(p);
        } catch (e) {
            setNotify({ msg: 'Failed to load logs', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    return (
        <div className="fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Request Logs</h1>
                    <p className="text-gray-500 text-sm">View API usage history</p>
                </div>
                <button onClick={() => load(1)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                    <i className="fas fa-sync-alt mr-2"></i>Refresh
                </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Time</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Model</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">User/Token</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Status</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Duration</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Tokens</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {logs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                                <td className="px-6 py-4 font-medium text-gray-900">{log.model}</td>
                                <td className="px-6 py-4 text-gray-600">
                                    <div className="text-xs text-gray-400">UID: {log.user_id}</div>
                                    <div className="truncate w-24 font-mono text-xs" title={log.token_key}>{log.token_key}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${log.status_code === 200 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {log.status_code}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-500">{log.duration_ms}ms</td>
                                <td className="px-6 py-4 text-gray-500">{log.total_tokens}</td>
                            </tr>
                        ))}
                        {logs.length === 0 && !loading && <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-400">No logs found</td></tr>}
                    </tbody>
                </table>
            </div>
            <div className="py-4 flex justify-between items-center text-sm text-gray-600">
                <div>Total: {total}</div>
                <div className="space-x-2">
                    <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50">Prev</button>
                    <span className="mx-2">Page {page}</span>
                    <button onClick={() => load(page + 1)} className="px-3 py-1 border rounded hover:bg-gray-50">Next</button>
                </div>
            </div>
        </div>
    );
};