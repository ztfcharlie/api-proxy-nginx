const { useState, useEffect } = React;

window.LoginView = ({ onLogin }) => {
    const [creds, setCreds] = useState({ username: '', password: '' });
    const [captchaData, setCaptchaData] = useState({ id: '', image: '' });
    const [captchaCode, setCaptchaCode] = useState('');
    const [error, setError] = useState('');

    const refreshCaptcha = async () => {
        try {
            const res = await window.api.auth.getCaptcha();
            setCaptchaData(res.data);
            setCaptchaCode(''); // Clear input on refresh
        } catch (err) {
            console.error("Failed to load captcha", err);
        }
    };

    useEffect(() => {
        refreshCaptcha();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const res = await window.api.auth.login({
                username: creds.username,
                password: creds.password,
                captchaId: captchaData.id,
                captchaCode: captchaCode
            });
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            onLogin(res.data.user);
            
            // Check for redirect param
            const params = new URLSearchParams(window.location.search);
            const redirectHash = params.get('redirect');
            if (redirectHash) {
                // Clear query params to clean up URL
                window.history.replaceState({}, document.title, window.location.pathname);
                // Navigate
                window.location.hash = redirectHash;
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
            // Refresh captcha on failure to prevent replay attacks and ensure fresh challenge
            refreshCaptcha();
        }
    };

    return (
        <div className="flex items-center justify-center h-full w-full bg-gray-900">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-[28rem] fade-in">
                <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Admin Login</h2>
                {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Username</label>
                        <input type="text" required className="w-full border rounded-lg px-3 py-2 mt-1 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={creds.username} onChange={e => setCreds({...creds, username: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Password</label>
                        <input type="password" required className="w-full border rounded-lg px-3 py-2 mt-1 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={creds.password} onChange={e => setCreds({...creds, password: e.target.value})} />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Verification Code</label>
                        <div className="flex space-x-2 mt-1">
                            <input type="text" required className="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none uppercase min-w-0"
                                placeholder="Code"
                                value={captchaCode} onChange={e => setCaptchaCode(e.target.value)} />
                            <div 
                                className="w-32 h-10 bg-gray-100 rounded cursor-pointer overflow-hidden border flex-shrink-0 flex items-center justify-center" 
                                onClick={refreshCaptcha}
                                title="Click to refresh"
                                dangerouslySetInnerHTML={{ __html: captchaData.image }}
                            ></div>
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors">Sign In</button>
                </form>
            </div>
        </div>
    );
};