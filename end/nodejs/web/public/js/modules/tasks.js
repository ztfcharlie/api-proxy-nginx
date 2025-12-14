const { useState, useEffect } = React;

window.TaskManager = ({ setNotify }) => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [filterStatus, setFilterStatus] = useState('');

    const load = async (p = 1) => {
        setLoading(true);
        try {
            const params = { page: p, limit: 20 };
            if (filterStatus) params.status = filterStatus;

            const res = await window.api.tasks.list(params);
            setTasks(res.data.data || []);
            setTotal(res.data.pagination.total);
            setPage(p);
        } catch (e) {
            setNotify({ msg: 'Failed to load tasks', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(1); }, []);

    const viewLog = (requestId) => {
        // Navigate to logs view with filter
        window.location.hash = `#logs?request_id=${requestId}`;
    };

    return (
        <div className="fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Async Tasks</h1>
                    <p className="text-gray-500 text-sm">Monitor long-running generation tasks (Sora, Suno, etc.)</p>
                </div>
                <div className="flex space-x-2">
                    <select className="border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="">All Status</option>
                        <option value="PENDING">Pending</option>
                        <option value="PROCESSING">Processing</option>
                        <option value="SUCCEEDED">Succeeded</option>
                        <option value="FAILED">Failed</option>
                    </select>
                    <button onClick={() => load(1)} className="px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200">
                        <i className={`fas fa-search ${loading ? 'fa-spin' : ''}`}></i>
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">ID</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Created</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">User</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Provider</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Upstream ID</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Status</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500">Pre-Cost</th>
                            <th className="px-6 py-3 text-right font-bold text-gray-500">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {tasks.map(t => (
                            <tr key={t.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-gray-500 font-mono">#{t.id}</td>
                                <td className="px-6 py-4 text-gray-500">{new Date(t.created_at).toLocaleString()}</td>
                                <td className="px-6 py-4 font-bold text-gray-700">{t.username || t.user_id}</td>
                                <td className="px-6 py-4 uppercase text-xs font-bold text-gray-600">{t.provider}</td>
                                <td className="px-6 py-4 font-mono text-xs text-blue-600 truncate max-w-[150px]" title={t.upstream_task_id}>
                                    {t.upstream_task_id}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold 
                                        ${t.status === 'SUCCEEDED' ? 'bg-green-100 text-green-700' : 
                                          t.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {t.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-bold text-gray-800">${parseFloat(t.pre_cost).toFixed(4)}</td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => viewLog(t.request_id)} className="text-blue-600 hover:underline">
                                        View Log
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {tasks.length === 0 && !loading && <tr><td colSpan="8" className="px-6 py-8 text-center text-gray-400">No tasks found</td></tr>}
                    </tbody>
                </table>
            </div>
            
            <div className="py-4 flex justify-between items-center text-sm text-gray-600">
                <div>Total: {total}</div>
                <div className="space-x-2">
                    <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50">Prev</button>
                    <span className="mx-2">Page {page}</span>
                    <button onClick={() => load(page + 1)} className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50" disabled={tasks.length < 20}>Next</button>
                </div>
            </div>
        </div>
    );
};