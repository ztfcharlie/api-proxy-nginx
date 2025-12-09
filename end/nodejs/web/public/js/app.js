const { useState, useEffect } = React;

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

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    // Render Login View if not authenticated
    if (!user) {
        return <window.LoginView onLogin={setUser} />;
    }

    // Menu Definition
    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-home' },
        { id: 'channels', label: 'Channels', icon: 'fas fa-network-wired' },
        { id: 'models', label: 'Models', icon: 'fas fa-cubes' },
        { id: 'tokens', label: 'Virtual Tokens', icon: 'fas fa-key' },
        { id: 'users', label: 'Users', icon: 'fas fa-users' },
        { id: 'logs', label: 'Request Logs', icon: 'fas fa-list-alt' },
        { id: 'jobs', label: 'Job Scheduler', icon: 'fas fa-clock' },
        { id: 'redis', label: 'Redis Inspector', icon: 'fas fa-database' },
        { id: 'system', label: 'System Status', icon: 'fas fa-server' },
        { id: 'account', label: 'Account Center', icon: 'fas fa-user-circle' }
    ];

    // View Router
    const renderContent = () => {
        switch (activeView) {
            case 'dashboard': return <window.Dashboard />;
            case 'channels': return <window.ChannelsManager setNotify={setNotify} />;
            case 'models': return <window.ModelManager setNotify={setNotify} />;
            case 'tokens': return <window.TokenManager setNotify={setNotify} />;
            case 'users': return <window.UserManager setNotify={setNotify} />;
            case 'logs': return <window.LogViewer setNotify={setNotify} />;
            case 'jobs': return <window.JobManager setNotify={setNotify} />;
            case 'redis': return <window.RedisInspector setNotify={setNotify} />;
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
                    <span className="text-white font-bold text-lg tracking-wide">Gemini Proxy</span>
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