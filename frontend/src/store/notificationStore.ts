import { create } from 'zustand';
import client from '../api/client';
import type { Notification } from '../types';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  priorityAlerts: Notification[];
  fetchNotifications: () => Promise<void>;
  addNotification: (notif: Notification) => void;
  addPriorityAlert: (alert: Notification) => void;
  resolveAlert: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
}

const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  priorityAlerts: [],

  fetchNotifications: async () => {
    const { data } = await client.get<Notification[]>('/api/notifications');
    // Unresolved priority alerts → blocking banner queue
    const alerts = data.filter(n => n.type === 'priority_alert' && !n.is_resolved);
    // Everything else (incl. resolved priority alerts) → notification panel
    const regular = data.filter(n => n.type !== 'priority_alert' || !!n.is_resolved);
    set({
      notifications: regular,
      unreadCount: regular.filter(n => !n.is_read).length,
      priorityAlerts: alerts,
    });
  },

  addNotification: (notif: Notification) => {
    if (notif.type === 'dm' || notif.type === 'priority_alert') return;
    set((s) => ({
      notifications: [notif, ...s.notifications],
      unreadCount: s.unreadCount + 1,
    }));
  },

  addPriorityAlert: (alert: Notification) => {
    if (alert.type !== 'priority_alert') return;
    set((s) => ({ priorityAlerts: [alert, ...s.priorityAlerts] }));
  },

  resolveAlert: async (id: string) => {
    await client.patch(`/api/notifications/${id}/resolve`);
    set((s) => {
      const resolved = s.priorityAlerts.find(a => a.id === id);
      return {
        priorityAlerts: s.priorityAlerts.filter(a => a.id !== id),
        // Fold the resolved alert into regular notifications as an audit entry
        notifications: resolved
          ? [{ ...resolved, is_resolved: 1, is_read: 1 }, ...s.notifications]
          : s.notifications,
      };
    });
  },

  markAllRead: async () => {
    set((s) => ({
      notifications: s.notifications.map(n => ({ ...n, is_read: 1 })),
      unreadCount: 0,
    }));
    await client.patch('/api/notifications/read');
  },

  markRead: async (id: string) => {
    set((s) => {
      const wasUnread = s.notifications.some(n => n.id === id && !n.is_read);
      return {
        notifications: s.notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n),
        unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      };
    });
    await client.patch('/api/notifications/read', { ids: [id] });
  },
}));

export default useNotificationStore;
