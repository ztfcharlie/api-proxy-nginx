const { useState, useEffect } = React;
const { Icons, Button, Input } = window.UI;

// --- Login Component ---
const Login = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await axios.post('/api/auth/login', { username, password });
            onLogin(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-gray-900">Universal AI Gateway</h2>
                    <p className="text-gray-500">Sign in to continue</p>
                </div>
                <form onSubmit={handleSubmit}>
                    <Input label="Username" value={username} onChange={setUsername} />
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    {error && <div className="mb-4 text-red-500 text-sm bg-red-50 p-2 rounded">{error}</div>}
                    <Button className="w-full justify-center" loading={loading}>Sign In</Button>
                </form>
            </div>
        </div>
    );
};

// --- Sidebar Component ---
const Sidebar = ({ activeTab, onTabChange, user }) => (
    <div className="w-64 bg-slate-900 text-white flex-shrink-0 flex flex-col shadow-xl z-10">
        <div className="h-16 flex items-center px-6 font-bold text-xl tracking-wider bg-slate-950">
            <span className="text-blue-500 mr-2">❖</span> Universal AI
        </div>
        <nav className="flex-1 py-6 space-y-1">
            {user.role === 'admin' && (
                <>
                    <button onClick={() => onTabChange('channels')} className={`w-full flex items-center px-6 py-3 transition-all duration-200 border-l-4 ${activeTab === 'channels' ? 'bg-slate-800 border-blue-500 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                        <Icons.Channels /> 渠道管理
                    </button>
                    <button onClick={() => onTabChange('models')} className={`w-full flex items-center px-6 py-3 transition-all duration-200 border-l-4 ${activeTab === 'models' ? 'bg-slate-800 border-blue-500 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                        <Icons.Models /> 模型管理
                    </button>
                    <button onClick={() => onTabChange('tokens')} className={`w-full flex items-center px-6 py-3 transition-all duration-200 border-l-4 ${activeTab === 'tokens' ? 'bg-slate-800 border-blue-500 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                        <Icons.Tokens /> 令牌管理
                    </button>
                    <button onClick={() => onTabChange('users')} className={`w-full flex items-center px-6 py-3 transition-all duration-200 border-l-4 ${activeTab === 'users' ? 'bg-slate-800 border-blue-500 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                        <Icons.Users /> 用户管理
                    </button>
                    <button onClick={() => onTabChange('redis')} className={`w-full flex items-center px-6 py-3 transition-all duration-200 border-l-4 ${activeTab === 'redis' ? 'bg-slate-800 border-blue-500 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                        <Icons.Redis /> Redis 观测
                    </button>
                    <button onClick={() => onTabChange('jobs')} className={`w-full flex items-center px-6 py-3 transition-all duration-200 border-l-4 ${activeTab === 'jobs' ? 'bg-slate-800 border-blue-500 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                        <Icons.Clock /> 任务调度
                    </button>
                </>
            )}
            <button onClick={() => onTabChange('logs')} className={`w-full flex items-center px-6 py-3 transition-all duration-200 border-l-4 ${activeTab === 'logs' ? 'bg-slate-800 border-blue-500 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <Icons.Logs /> 请求日志
            </button>
        </nav>
        <div className="p-4 bg-slate-950 text-xs text-slate-500 text-center">v4.4.0 Auth</div>
    </div>
);

// --- Main App Component ---
const App = () => {
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState('logs'); // Default to logs for safety

    useEffect(() => {
        const token = localStorage.getItem('token');
        const savedUser = localStorage.getItem('user');
        if (token && savedUser) {
            setUser(JSON.parse(savedUser));
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            
            // Validate token
            axios.get('/api/auth/me').catch(() => logout());
        }
    }, []);

    const login = (data) => {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
        setUser(data.user);
        setActiveTab(data.user.role === 'admin' ? 'channels' : 'logs');
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
    };

    if (!user) {
        return <Login onLogin={login} />;
    }

    return (
        <div className="flex h-screen bg-gray-100 font-sans antialiased">
            <Sidebar activeTab={activeTab} onTabChange={setActiveTab} user={user} />
            
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white shadow-sm z-0 h-16 flex items-center justify-between px-8">
                    <h2 className="text-xl font-semibold text-gray-800">
                        {activeTab === 'channels' && '真实渠道 (Upstream Channels)'}
                        {activeTab === 'models' && '模型定价 (Model Pricing)'}
                        {activeTab === 'tokens' && '虚拟令牌 (Virtual Tokens)'}
                        {activeTab === 'users' && '系统用户 (System Users)'}
                        {activeTab === 'redis' && '缓存观测 (Redis Inspector)'}
                        {activeTab === 'jobs' && '任务调度 (Job Scheduler)'}
                        {activeTab === 'logs' && '请求日志 (Request Logs)'}
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-500">
                            <span className="font-bold mr-1">{user.username}</span>
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs uppercase">{user.role}</span>
                        </div>
                        <button onClick={logout} className="text-sm text-red-600 hover:underline">Logout</button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8">
                    {/* Modules */}
                    {user.role === 'admin' && (
                        <>
                            {activeTab === 'channels' && window.Modules?.Channels && <window.Modules.Channels />}
                            {activeTab === 'models' && window.Modules?.Models && <window.Modules.Models />}
                            {activeTab === 'tokens' && window.Modules?.Tokens && <window.Modules.Tokens />}
                            {activeTab === 'users' && window.Modules?.Users && <window.Modules.Users />}
                            {activeTab === 'redis' && window.Modules?.Redis && <window.Modules.Redis />}
                            {activeTab === 'jobs' && window.Modules?.Jobs && <window.Modules.Jobs />}
                        </>
                    )}
                    {activeTab === 'logs' && window.Modules?.Logs && <window.Modules.Logs />}
                </div>
            </main>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);