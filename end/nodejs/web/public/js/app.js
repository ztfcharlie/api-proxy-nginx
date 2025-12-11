const { useState, useEffect } = React;

// Wrapper to safely load ClientTest component with polling
const ClientTestWrapper = (props) => {
    const [Component, setComponent] = useState(window.ClientTest);

    useEffect(() => {
        if (Component) return;

        const checkInterval = setInterval(() => {
            if (window.ClientTest) {
                setComponent(() => window.ClientTest);
                clearInterval(checkInterval);
            }
        }, 100);

        // Safety timeout after 10 seconds
        const timeout = setTimeout(() => {
            clearInterval(checkInterval);
        }, 10000);

        return () => {
            clearInterval(checkInterval);
            clearTimeout(timeout);
        };
    }, [Component]);

    if (!Component) {
        return (
            <div className="flex h-full items-center justify-center text-gray-500">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl mb-4 text-blue-500"></i>
                    <p>Loading Component... <br/><span className="text-xs text-gray-400">(Waiting for script compilation)</span></p>
                </div>
            </div>
        );
    }
    return <Component {...props} />;
};

// Main App Component
const App = () => {
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
        { id: 'live_logs', label: 'Live System Logs', icon: 'fas fa-terminal' }, // [Added]
        { id: 'log_files', label: 'Log Files', icon: 'fas fa-file-alt' }, // [Added]
        { id: 'jobs', label: 'Job Scheduler', icon: 'fas fa-clock' },
        { id: 'redis', label: 'Redis Inspector', icon: 'fas fa-database' },
        { id: 'client_test', label: 'Client Test', icon: 'fas fa-vial' }, // [Added]
        { id: 'system', label: 'System Status', icon: 'fas fa-server' },
        { id: 'account', label: 'Account Center', icon: 'fas fa-user-circle' }
    ];

    const menuItems = React.useMemo(() => {
        if (!user) return [];
        if (user.role === 'admin') return allMenuItems;
        // User role visible items
        return allMenuItems.filter(i => ['tokens', 'logs', 'account'].includes(i.id));
    }, [user]);

    // Redirect user from dashboard to tokens if not admin
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

    // Render Login View if not authenticated
    // [CRITICAL FIX] Hooks must be called before conditional return
    if (!user) {
        return <window.LoginView onLogin={setUser} />;
    }

    // View Router
    const renderContent = () => {
        // Security check for view access
        const isAllowed = menuItems.find(i => i.id === activeView);
        if (!isAllowed && activeView !== 'dashboard') { // Dashboard might be default fallback
             return <div className="text-center mt-20 text-red-500">Access Denied</div>;
        }

        switch (activeView) {
            case 'dashboard': return user.role === 'admin' ? <window.Dashboard /> : null;
            case 'channels': return <window.ChannelsManager setNotify={setNotify} />;
            case 'models': return <window.ModelManager setNotify={setNotify} />;
            case 'tokens': return <window.TokenManager user={user} setNotify={setNotify} />; // Pass user prop
            case 'users': return <window.UserManager setNotify={setNotify} />;
            case 'logs': return <window.LogViewer setNotify={setNotify} />;
            case 'live_logs': return <iframe src="logs.html" className="w-full h-full border-none rounded-lg shadow-inner bg-gray-900" title="System Logs"></iframe>; // [Fixed] Relative path
            case 'log_files': return <iframe src="log_files.html" className="w-full h-full border-none rounded-lg shadow-inner bg-white" title="Log Files"></iframe>; // [Fixed] Relative path
            case 'jobs': return <window.JobManager setNotify={setNotify} />;
            case 'redis': return <window.RedisInspector setNotify={setNotify} />;
            case 'client_test': return <ClientTestWrapper setNotify={setNotify} />;
            case 'system': return <window.SystemStatus setNotify={setNotify} />;
            case 'account': return <window.AccountCenter setNotify={setNotify} />;
            default: return <window.Dashboard />;
        }
    };

    return (
        <div className="flex h-screen w-full bg-gray-100">
            {/* Sidebar */}
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

            {/* Main Content Area */}
            <main className="flex-1 w-full flex flex-col overflow-hidden relative bg-gray-50">
                {/* Top Header */}
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

                {/* Content Body */}
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