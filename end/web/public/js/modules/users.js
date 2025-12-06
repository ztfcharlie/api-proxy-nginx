const { useState, useEffect } = React;
const { Button, Input, Modal, Switch } = window.UI;

window.Modules = window.Modules || {};

window.Modules.Users = () => {
    const [users, setUsers] = useState([]);
    const [modal, setModal] = useState({ open: false, isEdit: false });
    const [confirmModal, setConfirmModal] = useState({ open: false, id: null });
    const [form, setForm] = useState({});

    const API_BASE = '/api/admin';

    useEffect(() => {
        fetchUsers();
    }, []);

    const openModal = (user = null) => {
        if (user) {
            setForm({ id: user.id, username: user.username, remark: user.remark || '', password: '' });
            setModal({ open: true, isEdit: true });
        } else {
            setForm({ username: '', password: '', remark: '' });
            setModal({ open: true, isEdit: false });
        }
    };

    const saveUser = async () => {
        if (!form.username) return alert('Username required');
        if (!modal.isEdit && !form.password) return alert('Password required');

        try {
            if (modal.isEdit) {
                await axios.put(API_BASE + '/users/' + form.id, form);
            } else {
                await axios.post(API_BASE + '/users', form);
            }
            setModal({ open: false });
            fetchUsers();
        } catch (e) { 
            const msg = e.response?.data?.error || e.message;
            alert('操作失败: ' + msg);
        }
    };

    const deleteUser = async () => {
        try {
            await axios.delete(API_BASE + '/users/' + confirmModal.id);
            setConfirmModal({ open: false });
            fetchUsers();
        } catch (e) { 
            const msg = e.response?.data?.error || e.message;
            alert('删除失败: ' + msg);
        }
    };

    const toggleStatus = async (row) => {
        const newStatus = row.status ? 0 : 1;
        setUsers(users.map(u => u.id === row.id ? { ...u, status: newStatus } : u));
        try { await axios.put(API_BASE + '/users/' + row.id, { status: newStatus }); } catch (e) { fetchUsers(); }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end"><Button onClick={() => openModal()}>+ Create User</Button></div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remark</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {users.map(u => (
                            <tr key={u.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm text-gray-500">{u.id}</td>
                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{u.username}</td>
                                <td className="px-6 py-4 text-sm"><Switch checked={!!u.status} onChange={() => toggleStatus(u)} /></td>
                                <td className="px-6 py-4 text-sm text-gray-500">{u.remark}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-right text-sm font-medium">
                                    <button onClick={() => openModal(u)} className="text-blue-600 hover:text-blue-900 mr-4">Edit</button>
                                    <button onClick={() => setConfirmModal({ open: true, id: u.id })} className="text-red-600 hover:text-red-900">Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={modal.open} title={modal.isEdit ? "Edit User" : "Create User"} onClose={() => setModal({ open: false })} footer={
                <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setModal({ open: false })}>Cancel</Button><Button onClick={saveUser}>Save</Button></div>
            }>
                <div className="space-y-4">
                    <Input label="Username" value={form.username} onChange={v => setForm({...form, username: v})} disabled={modal.isEdit} />
                    <Input label={modal.isEdit ? "Password (Leave blank to keep)" : "Password"} type="password" value={form.password} onChange={v => setForm({...form, password: v})} />
                    <Input label="Remark" value={form.remark} onChange={v => setForm({...form, remark: v})} multiline rows={3} />
                </div>
            </Modal>

            <ConfirmDialog isOpen={confirmModal.open} title="Confirm Delete" message="Are you sure? This cannot be undone." onCancel={() => setConfirmModal({ open: false })} onConfirm={deleteUser} />
        </div>
    );
};
