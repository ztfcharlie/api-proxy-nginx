const { useState, useEffect } = React;

window.UserManager = ({ setNotify }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await window.api.users.list();
            setUsers(res.data.data || []);
        } catch (e) {
            console.error("Load users failed:", e);
            if (e.response) {
                console.error("Status:", e.response.status);
                console.error("Headers:", e.response.headers);
            }
            setNotify({ msg: 'Failed to load users', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.status = formData.get('status') === 'on' ? 1 : 0;
        
        try {
            if (editingUser) {
                if (!data.password) delete data.password;
                await window.api.users.update(editingUser.id, data);
                setNotify({ msg: 'User updated successfully', type: 'success' });
            } else {
                if (!data.password) return setNotify({ msg: 'Password is required', type: 'error' });
                data.status = 1;
                await window.api.users.create(data);
                setNotify({ msg: 'User created successfully', type: 'success' });
            }
            setShowModal(false);
            load();
        } catch (err) {
            setNotify({ msg: err.response?.data?.error || 'Operation failed', type: 'error' });
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            await window.api.users.delete(id);
            setNotify({ msg: 'User deleted', type: 'success' });
            load();
        } catch (err) {
            setNotify({ msg: err.response?.data?.error || 'Delete failed', type: 'error' });
        }
    };

    return (
        <div className="fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">User Management</h1>
                    <p className="text-gray-500 text-sm">Manage system access and roles</p>
                </div>
                <button onClick={() => { setEditingUser(null); setShowModal(true); }} 
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm">
                    <i className="fas fa-plus mr-2"></i>New User
                </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">ID</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Username</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Role</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Remark</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {users.map(u => (
                            <tr key={u.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm text-gray-500">#{u.id}</td>
                                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                    {u.username}
                                    {u.username === 'admin' && <span className="ml-2 text-xs text-purple-600 font-bold bg-purple-100 px-2 py-0.5 rounded">Super</span>}
                                </td>
                                <td className="px-6 py-4 text-sm">
                                    <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                                        {u.role || 'user'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${u.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {u.status ? 'Active' : 'Disabled'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">{u.remark}</td>
                                <td className="px-6 py-4 text-right text-sm space-x-2">
                                    <button onClick={() => { setEditingUser(u); setShowModal(true); }} className="text-blue-600 hover:text-blue-800">Edit</button>
                                    {u.username !== 'admin' && (
                                        <button onClick={() => handleDelete(u.id)} className="text-red-600 hover:text-red-800">Delete</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && !loading && <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-400">No users found</td></tr>}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 fade-in px-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800">{editingUser ? 'Edit User' : 'Create User'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Username
                                    {editingUser?.username === 'admin' && <span className="ml-2 text-xs text-purple-600 font-bold bg-purple-100 px-2 py-0.5 rounded">Super Admin</span>}
                                </label>
                                <input name="username" defaultValue={editingUser?.username} required disabled={!!editingUser}
                                    className="w-full border rounded-lg px-3 py-2 bg-gray-50 disabled:text-gray-500" />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Password {editingUser && <span className="text-gray-400 text-xs font-normal">(Leave blank to keep unchanged)</span>}
                                </label>
                                <input type="password" name="password" placeholder={editingUser ? "••••••" : ""} 
                                    className="w-full border rounded-lg px-3 py-2" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                <select name="role" defaultValue={editingUser?.role || 'user'} 
                                    disabled={editingUser?.username === 'admin'}
                                    className="w-full border rounded-lg px-3 py-2 bg-white disabled:bg-gray-100 disabled:text-gray-500">
                                    <option value="user">User (Standard)</option>
                                    <option value="admin">Admin (Full Access)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
                                <input name="remark" defaultValue={editingUser?.remark} className="w-full border rounded-lg px-3 py-2" />
                            </div>

                            {editingUser && (
                                <div className="flex items-center space-x-2 pt-2">
                                    <input type="checkbox" name="status" id="statusCheck" 
                                        defaultChecked={editingUser.status === 1} 
                                        disabled={editingUser.username === 'admin'}
                                        className="w-4 h-4 text-blue-600 rounded disabled:opacity-50" />
                                    <label htmlFor="statusCheck" className="text-sm font-medium text-gray-700">Account Active</label>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};