import axios from 'axios';
import useAuthStore from '../store/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const client = axios.create({
  baseURL: API_URL,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('fw_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const workspaceId = localStorage.getItem('fw_workspace');
  if (workspaceId) {
    try {
      const ws = JSON.parse(workspaceId);
      if (ws?.id) config.headers['x-workspace-id'] = ws.id;
    } catch {}
  }

  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default client;
