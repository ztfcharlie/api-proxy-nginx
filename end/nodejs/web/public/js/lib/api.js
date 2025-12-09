// API Definitions
window.api = {
    auth: {
        login: (username, password) => axios.post('/api/auth/login', { username, password }),
        changePassword: (oldPassword, newPassword) => axios.post('/api/auth/password', { oldPassword, newPassword }),
        me: () => axios.get('/api/auth/me')
    },
    channels: {
        list: (params) => axios.get('/api/admin/channels', { params }),
        create: (data) => axios.post('/api/admin/channels', data),
        update: (id, data) => axios.put(`/api/admin/channels/${id}`, data),
        delete: (id) => axios.delete(`/api/admin/channels/${id}`)
    },
    tokens: {
        list: () => axios.get('/api/admin/tokens'),
        create: (data) => axios.post('/api/admin/tokens', data),
        update: (id, data) => axios.put(`/api/admin/tokens/${id}`, data),
        delete: (id) => axios.delete(`/api/admin/tokens/${id}`)
    },
    models: {
        list: () => axios.get('/api/admin/models'),
        create: (data) => axios.post('/api/admin/models', data),
        update: (id, data) => axios.put(`/api/admin/models/${id}`, data),
        delete: (id) => axios.delete(`/api/admin/models/${id}`)
    },
    users: {
        list: () => axios.get('/api/admin/users'),
        create: (data) => axios.post('/api/admin/users', data),
        update: (id, data) => axios.put(`/api/admin/users/${id}`, data),
        delete: (id) => axios.delete(`/api/admin/users/${id}`)
    },
    logs: {
        list: (params) => axios.get('/api/admin/logs', { params })
    },
    jobs: {
        list: () => axios.get('/api/admin/jobs'),
        trigger: (name) => axios.post(`/api/admin/jobs/${name}/run`)
    },
    system: {
        status: () => axios.get('/api/admin/system/status')
    }
};

// Axios Interceptors
axios.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

axios.interceptors.response.use(response => response, error => {
    if (error.response && error.response.status === 401) {
        localStorage.removeItem('token');
        window.location.reload();
    }
    return Promise.reject(error);
});