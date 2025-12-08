const { useState } = React;

window.AccountCenter = ({ setNotify }) => {
    const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.newPassword !== form.confirmPassword) {
            return setNotify({ msg: 'New passwords do not match', type: 'error' });
        }
        if (form.newPassword.length < 6) {
            return setNotify({ msg: 'Password must be at least 6 characters', type: 'error' });
        }
        try {
            await window.api.auth.changePassword(form.oldPassword, form.newPassword);
            setNotify({ msg: 'Password updated successfully!', type: 'success' });
            setForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err) {
            setNotify({ msg: err.response?.data?.error || 'Update failed', type: 'error' });
        }
    };

    return (
        <div className="fade-in max-w-2xl mx-auto mt-10">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <div className="flex items-center mb-6 border-b pb-4">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-lg mr-4">
                        <i className="fas fa-user-shield text-xl"></i>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Account Security</h2>
                        <p className="text-sm text-gray-500">Update your login credentials</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                        <input type="password" required className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={form.oldPassword} onChange={e => setForm({...form, oldPassword: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                            <input type="password" required className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={form.newPassword} onChange={e => setForm({...form, newPassword: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                            <input type="password" required className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={form.confirmPassword} onChange={e => setForm({...form, confirmPassword: e.target.value})} />
                        </div>
                    </div>
                    <div className="pt-4 flex justify-end">
                        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors">
                            Update Password
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};