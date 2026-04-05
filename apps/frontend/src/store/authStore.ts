import { create } from 'zustand';
import client from '../api/client';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
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
}));

export default useAuthStore;
