const { useState, useEffect } = React;
const { Button, Icons } = window.UI;

window.Modules = window.Modules || {};

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
                                <td className="px-6 py-4 text-sm font-bold text-gray-900 font-mono">{job.name}</td>
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
