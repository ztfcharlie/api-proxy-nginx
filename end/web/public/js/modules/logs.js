const { useState, useEffect } = React;
const { Button, Input, Select, Modal, Pagination } = window.UI;

window.Modules = window.Modules || {};

window.Modules.Logs = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [filters, setFilters] = useState({ token_key: '', model: '', status: '' });
    
    const [detailModal, setDetailModal] = useState({ open: false, log: null });

    const API_BASE = '/api/admin/logs';

    useEffect(() => {
        fetchLogs();
    }, [page]); // page 变化时自动刷新

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = { page, limit: 20, ...filters };
            // 移除空参数
            Object.keys(params).forEach(k => !params[k] && delete params[k]);
            
            const res = await axios.get(API_BASE, { params });
            setLogs(res.data.data);
            setTotal(res.data.pagination.total);
        } catch (e) {
            console.error(e);
            alert('加载日志失败: ' + (e.response?.data?.error || e.message));
        }
        setLoading(false);
    };

    const handleFilterChange = (field, value) => {
        setFilters(prev => ({ ...prev, [field]: value }));
    };

    const handleSearch = () => {
        setPage(1);
        fetchLogs();
    };

    const showDetail = async (id) => {
        try {
            const res = await axios.get(`${API_BASE}/${id}`);
            setDetailModal({ open: true, log: res.data.data });
        } catch (e) {
            alert('获取详情失败');
        }
    };

    const formatTime = (isoString) => {
        return new Date(isoString).toLocaleString();
    };

    // 状态码颜色
    const getStatusColor = (status) => {
        if (status >= 200 && status < 300) return 'text-green-600 font-bold';
        if (status >= 400 && status < 500) return 'text-orange-500 font-bold';
        if (status >= 500) return 'text-red-600 font-bold';
        return 'text-gray-600';
    };

    return (
        <div className="space-y-6">
            {/* 筛选栏 */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-end">
                <div className="w-64">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Token Key (sk-...)</label>
                    <input 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        value={filters.token_key} 
                        onChange={e => handleFilterChange('token_key', e.target.value)} 
                        placeholder="Search Token..."
                    />
                </div>
                <div className="w-48">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Model</label>
                    <input 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        value={filters.model} 
                        onChange={e => handleFilterChange('model', e.target.value)} 
                        placeholder="gpt-4..."
                    />
                </div>
                <div className="w-32">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                    <select 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        value={filters.status} 
                        onChange={e => handleFilterChange('status', e.target.value)}
                    >
                        <option value="">All</option>
                        <option value="200">200 OK</option>
                        <option value="400">400 Bad Req</option>
                        <option value="401">401 Auth</option>
                        <option value="429">429 Rate</option>
                        <option value="500">500 Error</option>
                    </select>
                </div>
                <Button onClick={handleSearch}>Search</Button>
            </div>

            {/* 表格 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Request ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User Token</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Latency</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tokens (T/P/C)</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {logs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                                    {formatTime(log.created_at)}
                                </td>
                                <td className="px-6 py-4 text-xs font-mono text-gray-500 truncate max-w-[120px]" title={log.request_id}>
                                    {log.request_id.substring(0, 12)}...
                                </td>
                                <td className="px-6 py-4 text-xs font-mono text-blue-600 truncate max-w-[150px]" title={log.token_key}>
                                    {log.token_key ? log.token_key.substring(0, 15) + '...' : '-'}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-900">
                                    {log.model}
                                </td>
                                <td className={`px-6 py-4 text-sm ${getStatusColor(log.status_code)}`}>
                                    {log.status_code}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                    {log.duration_ms}ms
                                </td>
                                <td className="px-6 py-4 text-xs text-gray-600">
                                    <div>Total: <b>{log.total_tokens}</b></div>
                                    {/* Prompt/Completion 这里后端返回了没？检查一下后端 SQL select 字段 */}
                                    {/* 后端 SQL: SELECT id, request_id, token_key, model, status_code, duration_ms, total_tokens, created_at */}
                                    {/* 哎呀，列表接口没返回 prompt/completion tokens，也没返回 cost。我得去改后端 API */}
                                </td>
                                <td className="px-6 py-4 text-right text-sm font-medium">
                                    <button onClick={() => showDetail(log.id)} className="text-blue-600 hover:text-blue-900">Detail</button>
                                </td>
                            </tr>
                        ))}
                        {logs.length === 0 && !loading && <tr><td colSpan="8" className="p-8 text-center text-gray-400">No Logs Found</td></tr>}
                    </tbody>
                </table>
                
                {/* 分页器 */}
                <div className="px-6 py-4 border-t bg-gray-50 flex justify-between items-center">
                    <span className="text-sm text-gray-500">Total {total} records</span>
                    <div className="flex gap-2">
                        <Button size="sm" variant="secondary" disabled={page===1} onClick={() => setPage(p => Math.max(1, p-1))}>Prev</Button>
                        <span className="px-3 py-1 bg-white border rounded text-sm flex items-center">{page}</span>
                        <Button size="sm" variant="secondary" disabled={logs.length < 20} onClick={() => setPage(p => p+1)}>Next</Button>
                    </div>
                </div>
            </div>

            {/* 详情弹窗 */}
            <Modal 
                isOpen={detailModal.open} 
                title="Log Details" 
                size="xl"
                onClose={() => setDetailModal({ open: false, log: null })}
                footer={<Button onClick={() => setDetailModal({ open: false, log: null })}>Close</Button>}
            >
                {detailModal.log && (
                    <div className="space-y-4 font-mono text-sm">
                        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded border">
                            <div><span className="text-gray-500">Request ID:</span> {detailModal.log.request_id}</div>
                            <div><span className="text-gray-500">Client IP:</span> {detailModal.log.ip}</div>
                            <div><span className="text-gray-500">User Agent:</span> <div className="truncate w-full">{detailModal.log.user_agent}</div></div>
                            <div><span className="text-gray-500">URI:</span> {detailModal.log.request_uri}</div>
                            <div><span className="text-gray-500">Cost:</span> <span className="text-green-600 font-bold">${detailModal.log.cost}</span></div>
                            <div><span className="text-gray-500">Upstream Latency:</span> {detailModal.log.upstream_duration_ms}ms</div>
                        </div>

                        <div>
                            <div className="mb-1 font-bold text-gray-700">Request Body</div>
                            <div className="bg-slate-900 text-slate-300 p-3 rounded overflow-auto max-h-48 whitespace-pre-wrap break-words">
                                {detailModal.log.req_body || '(No content or Privacy Masked)'}
                            </div>
                        </div>

                        <div>
                            <div className="mb-1 font-bold text-gray-700">Response Body</div>
                            <div className="bg-slate-900 text-slate-300 p-3 rounded overflow-auto max-h-64 whitespace-pre-wrap break-words">
                                {detailModal.log.res_body || '(No content or Privacy Masked)'}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
