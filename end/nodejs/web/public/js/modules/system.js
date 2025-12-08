const { useState, useEffect } = React;

window.SystemStatus = ({ setNotify }) => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const res = await window.api.system.status();
            setStatus(res.data.data);
        } catch (e) {
            setNotify({ msg: 'Failed to load system status', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const StatusCard = ({ title, data, icon }) => {
        const isHealthy = data?.status === 'healthy';
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center mb-4">
                    <div className={`p-3 rounded-lg ${isHealthy ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'} mr-4`}>
                        <i className={`fas ${icon} text-xl`}></i>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
                        <span className={`text-xs font-bold uppercase ${isHealthy ? 'text-green-600' : 'text-red-600'}`}>
                            {data?.status || 'Unknown'}
                        </span>
                    </div>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                    {data?.error && <div className="text-red-500 break-words text-xs">{data.error}</div>}
                    {data?.latency !== undefined && <div>Latency: {data.latency}ms</div>}
                    {data?.last_heartbeat && <div>Heartbeat: {new Date(data.last_heartbeat).toLocaleString()}</div>}
                    {data?.message && <div>Msg: {data.message}</div>}
                </div>
            </div>
        );
    };

    if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

    return (
        <div className="fade-in h-full">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">System Status</h1>
                    <p className="text-gray-500 text-sm">Health check of all components</p>
                </div>
                <button onClick={load} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                    <i className="fas fa-sync-alt mr-2"></i>Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatusCard title="MySQL Database" data={status?.mysql} icon="fa-database" />
                <StatusCard title="Redis Cache" data={status?.redis} icon="fa-memory" />
                <StatusCard title="Go Core Service" data={status?.go_core} icon="fa-microchip" />
                <StatusCard title="Nginx Proxy" data={status?.nginx} icon="fa-server" />
            </div>
        </div>
    );
};