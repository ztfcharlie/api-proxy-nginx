const { useState, useEffect, useMemo } = React;
const { Button, Input, Select, ConfirmDialog, Modal, Icons } = window.UI;

window.Modules = window.Modules || {};

window.Modules.Models = () => {
    const [models, setModels] = useState([]);
    const [activeProvider, setActiveProvider] = useState('openai');
    const [modal, setModal] = useState({ open: false, isEdit: false });
    const [form, setForm] = useState({});
    const [confirm, setConfirm] = useState({ open: false, id: null });

    const API_BASE = '/api/admin';

    useEffect(() => { fetchModels(); }, []);

    const fetchModels = async () => {
        try {
            const res = await axios.get(API_BASE + '/models');
            setModels(res.data.data);
        } catch (e) { console.error(e); }
    };

    const filteredModels = useMemo(() => models.filter(m => m.provider === activeProvider), [models, activeProvider]);

    const openModal = (model = null) => {
        if (model) {
            setForm({ ...model });
            setModal({ open: true, isEdit: true });
        } else {
            setForm({ provider: activeProvider, name: '', price_input: 0, price_output: 0, price_cache: 0, price_time: 0, price_request: 0 });
            setModal({ open: true, isEdit: false });
        }
    };

    const saveModel = async () => {
        try {
            if (modal.isEdit) await axios.put(API_BASE + '/models/' + form.id, form);
            else await axios.post(API_BASE + '/models', form);
            setModal({ open: false });
            fetchModels();
        } catch (e) { alert('保存失败'); }
    };

    const deleteModel = async () => {
        try {
            await axios.delete(API_BASE + '/models/' + confirm.id);
            setConfirm({ open: false });
            fetchModels();
        } catch (e) { alert('删除失败'); }
    };

    return (
        <div className="space-y-6">
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                {['openai', 'google', 'anthropic', 'qwen', 'deepseek'].map(p => (
                    <button key={p} onClick={() => setActiveProvider(p)} className={`py-4 px-6 font-medium text-sm border-b-2 transition-colors uppercase ${activeProvider === p ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {p}
                    </button>
                ))}
            </div>

            <div className="flex justify-end"><Button onClick={() => openModal()}>+ 新增模型</Button></div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Input ($/1M)</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Output ($/1M)</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cache ($/1M)</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Time ($/s)</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Req ($/Req)</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredModels.map(m => (
                            <tr key={m.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{m.name}</td>
                                <td className="px-6 py-4 text-right text-sm text-gray-500">{m.price_input}</td>
                                <td className="px-6 py-4 text-right text-sm text-gray-500">{m.price_output}</td>
                                <td className="px-6 py-4 text-right text-sm text-gray-500">{m.price_cache}</td>
                                <td className="px-6 py-4 text-right text-sm text-gray-500">{m.price_time}</td>
                                <td className="px-6 py-4 text-right text-sm text-gray-500">{m.price_request}</td>
                                <td className="px-6 py-4 text-right text-sm font-medium">
                                    <button onClick={() => openModal(m)} className="text-blue-600 hover:text-blue-900 mr-4">Edit</button>
                                    <button onClick={() => setConfirm({ open: true, id: m.id })} className="text-red-600 hover:text-red-900">Delete</button>
                                </td>
                            </tr>
                        ))}
                        {filteredModels.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-gray-400">暂无数据</td></tr>}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={modal.open} title={modal.isEdit ? "编辑模型" : "新增模型"} onClose={() => setModal({ open: false })} footer={
                <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setModal({ open: false })}>取消</Button><Button onClick={saveModel}>保存</Button></div>
            }>
                <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
                <div className="grid grid-cols-2 gap-4">
                    <Input label="Input Price ($/1M)" type="number" value={form.price_input} onChange={v => setForm({ ...form, price_input: v })} />
                    <Input label="Output Price ($/1M)" type="number" value={form.price_output} onChange={v => setForm({ ...form, price_output: v })} />
                    <Input label="Cache Price ($/1M)" type="number" value={form.price_cache} onChange={v => setForm({ ...form, price_cache: v })} />
                    <Input label="Request Price ($/Req)" type="number" value={form.price_request} onChange={v => setForm({ ...form, price_request: v })} />
                    <Input label="Time Price ($/s)" type="number" value={form.price_time} onChange={v => setForm({ ...form, price_time: v })} />
                </div>
            </Modal>

            <ConfirmDialog isOpen={confirm.open} title="确认删除" message="Delete this model?" onConfirm={deleteModel} onCancel={() => setConfirm({ open: false })} />
        </div>
    );
};
