const { useState, useEffect } = React;
const { Icons } = window.UI;

// --- Sidebar Component ---
const Sidebar = ({ activeTab, onTabChange }) => (
    <div className="w-64 bg-slate-900 text-white flex-shrink-0 flex flex-col shadow-xl z-10">
        <div className="h-16 flex items-center px-6 font-bold text-xl tracking-wider bg-slate-950">
            <span className="text-blue-500 mr-2">❖</span> Gemini Proxy
        </div>
        <nav className="flex-1 py-6 space-y-1">
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
        </nav>
        <div className="p-4 bg-slate-950 text-xs text-slate-500 text-center">v4.0.0 Modular</div>
    </div>
);

// --- Main App Component ---
const App = () => {
    const [activeTab, setActiveTab] = useState('channels');

    return (
        <div className="flex h-screen bg-gray-100 font-sans antialiased">
            <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
            
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white shadow-sm z-0 h-16 flex items-center justify-between px-8">
                    <h2 className="text-xl font-semibold text-gray-800">
                        {activeTab === 'channels' && '真实渠道 (Upstream Channels)'}
                        {activeTab === 'models' && '模型定价 (Model Pricing)'}
                        {activeTab === 'tokens' && '虚拟令牌 (Virtual Tokens)'}
                        {activeTab === 'users' && '系统用户 (System Users)'}
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-500">Admin Console</div>
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">A</div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8">
                    {/* Modules */}
                    {activeTab === 'channels' && window.Modules && window.Modules.Channels && <window.Modules.Channels />}
                    {activeTab === 'models' && window.Modules && window.Modules.Models && <window.Modules.Models />}
                    {activeTab === 'tokens' && window.Modules && window.Modules.Tokens && <window.Modules.Tokens />}
                    {activeTab === 'users' && window.Modules && window.Modules.Users && <window.Modules.Users />}
                </div>
            </main>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);