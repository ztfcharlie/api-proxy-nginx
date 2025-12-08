const { useState, useEffect } = React;

window.JobManager = ({ setNotify }) => {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const res = await window.api.jobs.list();
            setJobs(res.data.data || []);
        } catch (e) {
            setNotify({ msg: 'Failed to load jobs', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleTrigger = async (name) => {
        try {
            await window.api.jobs.trigger(name);
            setNotify({ msg: 'Job triggered', type: 'success' });
            setTimeout(load, 1000);
        } catch (e) {
            setNotify({ msg: 'Trigger failed', type: 'error' });
        }
    };

    return (
        <div className="fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Job Scheduler</h1>
                    <p className="text-gray-500 text-sm">Manage background tasks</p>
                </div>
                <button onClick={load} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                    <i className="fas fa-sync-alt mr-2"></i>Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {jobs.map(job => (
                    <div key={job.name} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">{job.name}</h3>
                                <p className="text-sm text-gray-500 mt-1">{job.description}</p>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${job.status === 'running' ? 'bg-blue-100 text-blue-700' : (job.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600')}`}>
                                {job.status || 'idle'}
                            </span>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600 mb-6">
                            <div className="flex justify-between">
                                <span>Last Run:</span>
                                <span className="font-mono">{job.lastRun ? new Date(job.lastRun).toLocaleString() : 'Never'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Next Run:</span>
                                <span className="font-mono">{job.nextRun ? new Date(job.nextRun).toLocaleString() : '-'}</span>
                            </div>
                            <div className="bg-gray-50 p-2 rounded mt-2 text-xs font-mono break-all text-gray-500">
                                {job.lastResult || 'No result'}
                            </div>
                        </div>
                        <button onClick={() => handleTrigger(job.name)} disabled={job.status === 'running'}
                            className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                            {job.status === 'running' ? 'Running...' : 'Run Now'}
                        </button>
                    </div>
                ))}
                {jobs.length === 0 && !loading && <div className="col-span-full text-center text-gray-500 py-10">No jobs found</div>}
            </div>
        </div>
    );
};