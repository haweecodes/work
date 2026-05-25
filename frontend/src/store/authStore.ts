import { create } from 'zustand';
import client from '../api/client';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (fields: Partial<Pick<User, 'name' | 'mobile_number' | 'working_hours'>>) => Promise<void>;
  setStatus: (emoji: string | null, text: string | null) => Promise<void>;
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: JSON.parse(localStorage.getItem('fw_user') || 'null') as User | null,
  token: localStorage.getItem('fw_token') || null,

  login: (user: User, token: string) => {
    localStorage.setItem('fw_token', token);
    localStorage.setItem('fw_user', JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('fw_token');
    localStorage.removeItem('fw_user');
    set({ user: null, token: null });
  },

  updateUser: async (fields) => {
    const { data } = await client.patch<{ user: User }>('/api/auth/profile', fields);
    const updated = { ...get().user!, ...data.user };
    localStorage.setItem('fw_user', JSON.stringify(updated));
    set({ user: updated });
  },

  setStatus: async (emoji, text) => {
    const { data } = await client.patch<{ user: User }>('/api/auth/status', { status_emoji: emoji, status_text: text });
    const updated = { ...get().user!, status_emoji: data.user.status_emoji, status_text: data.user.status_text };
    localStorage.setItem('fw_user', JSON.stringify(updated));
    set({ user: updated });
  },
}));

export default useAuthStore;
