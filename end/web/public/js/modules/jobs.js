const { useState, useEffect } = React;
const { Button, Icons } = window.UI;

window.Modules = window.Modules || {};

// [Added] 系统状态组件
const SystemStatus = () => {
    const [status, setStatus] = useState(null);

    useEffect(() => {
        fetchStatus();
        const timer = setInterval(fetchStatus, 5000);
        return () => clearInterval(timer);
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await axios.get('/api/admin/system/status');
            setStatus(res.data.data);
        } catch (e) {}
    };

    if (!status) return <div className="p-4 text-gray-400 animate-pulse">Loading system status...</div>;

    const Card = ({ title, data, icon }) => {
        const isHealthy = data.status === 'healthy';
        const isWarning = data.status === 'warning';
        const color = isHealthy ? 'bg-green-50 border-green-200' : (isWarning ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200');
        const textColor = isHealthy ? 'text-green-700' : (isWarning ? 'text-orange-700' : 'text-red-700');

        return (
            <div className={`p-4 rounded-xl border ${color} flex items-center gap-4 flex-1 transition-all hover:shadow-md`}>
                <div className={`p-3 rounded-full bg-white shadow-sm text-2xl`}>{icon}</div>
                <div>
                    <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">{title}</div>
                    <div className={`text-lg font-bold ${textColor} flex items-center gap-2`}>
                        {data.status.toUpperCase()}
                        {isHealthy && <span className="text-xs font-normal bg-white px-2 py-0.5 rounded border opacity-75 font-mono">
                            {data.latency ? `${data.latency}ms` : (data.lag !== undefined ? `Lag: ${data.lag}s` : 'OK')}
                        </span>}
                    </div>
                    {data.error && <div className="text-xs text-red-600 mt-1 font-mono break-words max-w-[150px]">{data.error}</div>}
                    {data.last_heartbeat && <div className="text-[10px] text-gray-400 mt-1">Last Beat: {new Date(data.last_heartbeat).toLocaleTimeString()}</div>}
                </div>
            </div>
        );
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card title="Go Core Service" data={status.go_core} icon="⚙️" />
            <Card title="Redis Cache" data={status.redis} icon="🔥" />
            <Card title="MySQL Database" data={status.mysql} icon="🐬" />
            <Card title="Nginx Gateway" data={status.nginx} icon="🌐" />
        </div>
    );
};

window.Modules.Jobs = () => {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(false);

    const API_BASE = '/api/admin/jobs';

    useEffect(() => {
        fetchJobs();
        const timer = setInterval(fetchJobs, 5000); // 自动刷新
        return () => clearInterval(timer);
    }, []);

    const fetchJobs = async () => {
        try {
            const res = await axios.get(API_BASE);
            setJobs(res.data.data);
        } catch (e) { console.error(e); }
    };

    const runJob = async (name) => {
        try {
            setLoading(true);
            await axios.post(`${API_BASE}/${name}/run`);
            alert('Job triggered');
            fetchJobs();
        } catch (e) { 
            alert('Run failed: ' + (e.response?.data?.error || e.message)); 
        } finally {
            setLoading(false);
        }
    };

    const editInterval = async (job) => {
        const currentMin = Math.round(job.interval / 60000);
        const input = prompt(`Enter new interval for ${job.name}\nExamples: "5" (5 mins), "30s" (30 secs), "500ms"`, currentMin);
        
        if (input) {
            let ms = 0;
            const val = parseFloat(input);
            if (isNaN(val)) return alert('Invalid number');

            if (input.toLowerCase().endsWith('ms')) {
                ms = val;
            } else if (input.toLowerCase().endsWith('s')) {
                ms = val * 1000;
            } else {
                // Default to minutes
                ms = val * 60 * 1000;
            }

            if (ms < 1000) return alert('Interval too short (min 1s)');

            try {
                await axios.put(`${API_BASE}/${job.name}/interval`, { interval: ms });
                fetchJobs();
            } catch (e) { alert('Update failed: ' + e.message); }
        }
    };

    return (
        <div className="space-y-6">
            {/* 系统状态面板 */}
            <SystemStatus />

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Interval</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Run</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Run</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Result</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {jobs.map(job => (
                            <tr key={job.name} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm text-gray-900">
                                    <div className="font-bold font-mono">{job.name}</div>
                                    {job.description && <div className="text-xs text-gray-500 mt-1">{job.description}</div>}
                                    {job.isRemote && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">Go Service</span>}
                                </td>
                                <td className="px-6 py-4 text-sm text-blue-600 cursor-pointer hover:underline" onClick={() => editInterval(job)}>
                                    {Math.round(job.interval / 1000 / 60)}m ({job.interval}ms) ✎
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">{job.lastRun ? new Date(job.lastRun).toLocaleString() : '-'}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{job.nextRun ? new Date(job.nextRun).toLocaleString() : '-'}</td>
                                <td className="px-6 py-4 text-xs font-mono text-gray-500 truncate max-w-xs" title={job.lastResult}>{job.lastResult || '-'}</td>
                                <td className="px-6 py-4 text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        job.status === 'running' ? 'bg-blue-100 text-blue-800 animate-pulse' : 
                                        job.status === 'failed' ? 'bg-red-100 text-red-800' : 
                                        'bg-green-100 text-green-800'
                                    }`}>
                                        {job.status.toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right text-sm font-medium">
                                    <Button size="sm" onClick={() => runJob(job.name)} disabled={loading || job.status === 'running'}>Run Now</Button>
                                </td>
                            </tr>
                        ))}
                        {jobs.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-gray-400">No Jobs Registered</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
};