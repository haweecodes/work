import { create } from 'zustand';
import client from '../api/client';
import type { Notification } from '../types';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  fetchNotifications: (userId: string) => Promise<void>;
  addNotification: (notif: Notification) => void;
  markAllRead: (userId: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
}

const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,

  fetchNotifications: async (userId: string) => {
    const { data } = await client.get<Notification[]>(`/api/notifications/${userId}`);
    set({ notifications: data, unreadCount: data.filter(n => !n.is_read).length });
  },

  addNotification: (notif: Notification) => {
    set((s) => ({
      notifications: [notif, ...s.notifications],
      unreadCount: s.unreadCount + 1,
    }));
  },

  markAllRead: async (_userId: string) => {
    await client.patch('/api/notifications/read');
    set((s) => ({
      notifications: s.notifications.map(n => ({ ...n, is_read: 1 })),
      unreadCount: 0,
    }));
  },

  markRead: async (id: string) => {
    await client.patch('/api/notifications/read', { ids: [id] });
    set((s) => ({
      notifications: s.notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },
}));

export default useNotificationStore;
