const { useState, useEffect } = React;

// ==========================================
// MODULE: Main Application
// ==========================================
const App = () => {
    // [STYLE ADJUSTMENT] Global Font Scaling for Admin Console
    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `
            body, #root { font-size: 13px !important; } /* ~80% of standard 16px */
            
            /* Adjust Headings */
            h1 { font-size: 1.5rem !important; }
            h2 { font-size: 1.25rem !important; }
            h3 { font-size: 1.1rem !important; }
            
            /* Adjust Icons */
            .fas, .fab, .far { font-size: 0.9em !important; }
            
            /* Tighten Sidebar */
            .nav-item { padding-top: 0.5rem !important; padding-bottom: 0.5rem !important; }
            
            /* Tighten Table Cells */
            td, th { padding: 0.5rem 0.75rem !important; }
            
            /* Adjust Inputs */
            input, select, textarea { font-size: 13px !important; padding: 0.4rem !important; }
            
            /* Custom Scrollbar update for smaller content */
            .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        `;
        document.head.appendChild(style);
        return () => document.head.removeChild(style);
    }, []);

    const [user, setUser] = useState(null);
    const [activeView, setActiveView] = useState('dashboard');
    const [notify, setNotify] = useState({ msg: '', type: '' });

    // Check login status on mount
    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (token && userData) {
            try {
                setUser(JSON.parse(userData));
            } catch (e) {
                localStorage.removeItem('token');
            }
        }
    }, []);

    // Menu Definition
    const allMenuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-home' },
        { id: 'channels', label: 'Channels', icon: 'fas fa-network-wired' },
        { id: 'models', label: 'Models', icon: 'fas fa-cubes' },
        { id: 'tokens', label: 'Virtual Tokens', icon: 'fas fa-key' },
        { id: 'users', label: 'Users', icon: 'fas fa-users' },
        { id: 'logs', label: 'Request Logs', icon: 'fas fa-list-alt' },
        { id: 'live_logs', label: 'Live System Logs', icon: 'fas fa-terminal' },
        { id: 'log_files', label: 'Log Files', icon: 'fas fa-file-alt' },
        { id: 'jobs', label: 'Job Scheduler', icon: 'fas fa-clock' },
        { id: 'redis', label: 'Redis Inspector', icon: 'fas fa-database' },
        { id: 'client_test', label: 'Client Test', icon: 'fas fa-vial' },
        { id: 'system', label: 'System Status', icon: 'fas fa-server' },
        { id: 'account', label: 'Account Center', icon: 'fas fa-user-circle' }
    ];

    const menuItems = React.useMemo(() => {
        if (!user) return [];
        if (user.role === 'admin') return allMenuItems;
        return allMenuItems.filter(i => ['tokens', 'logs', 'account'].includes(i.id));
    }, [user]);

    useEffect(() => {
        if (user && user.role !== 'admin' && activeView === 'dashboard') {
            setActiveView('tokens');
        }
    }, [user, activeView]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    if (!user) {
        return <window.LoginView onLogin={setUser} />;
    }

    const renderContent = () => {
        const isAllowed = menuItems.find(i => i.id === activeView);
        if (!isAllowed && activeView !== 'dashboard') {
             return <div className="text-center mt-20 text-red-500">Access Denied</div>;
        }

        switch (activeView) {
            case 'dashboard': return user.role === 'admin' ? <window.Dashboard /> : null;
            case 'channels': return <window.ChannelsManager setNotify={setNotify} />;
            case 'models': return <window.ModelManager setNotify={setNotify} />;
            case 'tokens': return <window.TokenManager user={user} setNotify={setNotify} />;
            case 'users': return <window.UserManager setNotify={setNotify} />;
            case 'logs': return <window.LogViewer setNotify={setNotify} />;
            case 'live_logs': return <iframe src="logs.html" className="w-full h-full border-none rounded-lg shadow-inner bg-gray-900" title="System Logs"></iframe>;
            case 'log_files': return <iframe src="log_files.html" className="w-full h-full border-none rounded-lg shadow-inner bg-white" title="Log Files"></iframe>;
            case 'jobs': return <window.JobManager setNotify={setNotify} />;
            case 'redis': return <window.RedisInspector setNotify={setNotify} />;
            // Iframe integration for complete isolation and stability
            case 'client_test': return <iframe src="client-test.html" className="w-full h-full border-none rounded-lg shadow-inner bg-gray-50" title="Client Test Tool"></iframe>;
            case 'system': return <window.SystemStatus setNotify={setNotify} />;
            case 'account': return <window.AccountCenter setNotify={setNotify} />;
            default: return <window.Dashboard />;
        }
    };

    return (
        <div className="flex h-screen w-full bg-gray-100">
            <aside className="w-64 bg-gray-900 text-gray-300 flex flex-col shadow-xl z-20 transition-all duration-300 flex-shrink-0">
                <div className="h-16 flex items-center px-6 bg-gray-800 border-b border-gray-700 shadow-md">
                    <i className="fas fa-project-diagram text-blue-500 text-xl mr-3"></i>
                    <span className="text-white font-bold text-lg tracking-wide">AI Gateway</span>
                </div>
                <nav className="flex-1 py-6 space-y-1 px-3 overflow-y-auto custom-scrollbar">
                    {menuItems.map(item => (
                        <button key={item.id}
                            onClick={() => setActiveView(item.id)}
                            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 nav-item ${activeView === item.id ? 'active text-white bg-gray-800 shadow-lg translate-x-1' : 'hover:bg-gray-800 hover:text-white hover:translate-x-1'}`}>
                            <i className={`${item.icon} w-6 text-center mr-3 ${activeView === item.id ? 'text-blue-400' : 'text-gray-500'} transition-colors`}></i>
                            {item.label}
                        </button>
                    ))}
                </nav>
                <div className="p-4 border-t border-gray-800">
                    <button onClick={handleLogout} className="w-full flex items-center px-4 py-2 text-sm text-red-400 hover:bg-gray-800 hover:text-red-300 rounded-lg transition-colors duration-200">
                        <i className="fas fa-sign-out-alt w-6 text-center mr-3"></i> Sign Out
                    </button>
                </div>
            </aside>
            <main className="flex-1 w-full flex flex-col overflow-hidden relative bg-gray-50">
                <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shadow-sm z-10 flex-shrink-0">
                    <div className="flex items-center">
                        <h2 className="text-lg font-semibold text-gray-800 capitalize flex items-center">
                            <i className={`${menuItems.find(i => i.id === activeView)?.icon} mr-2 text-gray-400`}></i>
                            {menuItems.find(i => i.id === activeView)?.label}
                        </h2>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                            Logged in as <span className="font-bold text-gray-700 ml-1">{user.username}</span>
                            {user.role === 'admin' && <i className="fas fa-shield-alt ml-2 text-blue-500" title="Admin Access"></i>}
                        </div>
                    </div>
                </header>
                <div className="flex-1 w-full overflow-hidden p-8 relative">
                    <window.Notification message={notify.msg} type={notify.type} onClose={() => setNotify({ msg: '', type: '' })} />
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);