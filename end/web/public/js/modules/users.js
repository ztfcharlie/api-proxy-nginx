const { useState, useEffect } = React;
const { Button, Input, Modal, Switch } = window.UI;

window.Modules = window.Modules || {};

window.Modules.Users = () => {
    const [users, setUsers] = useState([]);
    const [modal, setModal] = useState({ open: false });
    const [form, setForm] = useState({});

    const API_BASE = '/api/admin';

    useEffect(() => { fetchUsers(); }, []);

    const fetchUsers = async () => {
        try {
            const res = await axios.get(API_BASE + '/users');
            setUsers(res.data.data);
        } catch (e) { console.error(e); }
    };

    const createUser = async () => {
        try {
            await axios.post(API_BASE + '/users', form);
            setModal({ open: false });
            fetchUsers();
        } catch (e) { alert('Create failed'); }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end"><Button onClick={() => { setForm({}); setModal({ open: true }); }}>+ Create User</Button></div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {users.map(u => (
                            <tr key={u.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm text-gray-500">{u.id}</td>
                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{u.username}</td>
                                <td className="px-6 py-4 text-sm"><Switch checked={!!u.status} disabled /></td>
                                <td className="px-6 py-4 text-sm text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={modal.open} title="Create User" onClose={() => setModal({ open: false })} footer={
                <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setModal({ open: false })}>Cancel</Button><Button onClick={createUser}>Create</Button></div>
            }>
                <Input label="Username" value={form.username} onChange={v => setForm({ ...form, username: v })} />
                <Input label="Password" type="password" value={form.password} onChange={v => setForm({ ...form, password: v })} />
                <Input label="Remark" value={form.remark} onChange={v => setForm({ ...form, remark: v })} />
            </Modal>
        </div>
    );
};
