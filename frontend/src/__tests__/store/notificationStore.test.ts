import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Notification } from '../../types';

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import client from '../../api/client';
import useNotificationStore from '../../store/notificationStore';

const makeNotif = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  user_id: 'user-1',
  type: 'mention',
  is_read: 0,
  is_resolved: 0,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
} as Notification);

beforeEach(() => {
  useNotificationStore.setState({ notifications: [], priorityAlerts: [], unreadCount: 0 });
  vi.clearAllMocks();
});

// ── Initial state ─────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('has empty notifications array', () => {
    expect(useNotificationStore.getState().notifications).toEqual([]);
  });

  it('has empty priorityAlerts array', () => {
    expect(useNotificationStore.getState().priorityAlerts).toEqual([]);
  });

  it('has unreadCount of 0', () => {
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });
});

// ── fetchNotifications ────────────────────────────────────────────────────────

describe('fetchNotifications', () => {
  it('puts unresolved priority_alert into priorityAlerts', async () => {
    const data = [makeNotif({ id: 'a1', type: 'priority_alert', is_resolved: 0 })];
    vi.mocked(client.get).mockResolvedValue({ data });

    await useNotificationStore.getState().fetchNotifications();

    expect(useNotificationStore.getState().priorityAlerts).toHaveLength(1);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('puts resolved priority_alert into regular notifications', async () => {
    const data = [makeNotif({ id: 'a2', type: 'priority_alert', is_resolved: 1, is_read: 1 })];
    vi.mocked(client.get).mockResolvedValue({ data });

    await useNotificationStore.getState().fetchNotifications();

    expect(useNotificationStore.getState().priorityAlerts).toHaveLength(0);
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it('correctly counts unread regular notifications', async () => {
    const data = [
      makeNotif({ id: 'n1', type: 'mention', is_read: 0 }),
      makeNotif({ id: 'n2', type: 'mention', is_read: 1 }),
      makeNotif({ id: 'n3', type: 'task_assigned', is_read: 0 }),
    ];
    vi.mocked(client.get).mockResolvedValue({ data });

    await useNotificationStore.getState().fetchNotifications();

    expect(useNotificationStore.getState().unreadCount).toBe(2);
  });
});

// ── addNotification ───────────────────────────────────────────────────────────

describe('addNotification', () => {
  it('prepends notification to the list', () => {
    useNotificationStore.setState({ notifications: [makeNotif({ id: 'old' })], unreadCount: 1, priorityAlerts: [] });
    useNotificationStore.getState().addNotification(makeNotif({ id: 'new' }));

    const { notifications } = useNotificationStore.getState();
    expect(notifications[0].id).toBe('new');
    expect(notifications).toHaveLength(2);
  });

  it('increments unreadCount', () => {
    useNotificationStore.getState().addNotification(makeNotif({ id: 'n1' }));
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it('ignores DM type notifications', () => {
    useNotificationStore.getState().addNotification(makeNotif({ type: 'dm' }));
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('ignores priority_alert type (handled separately)', () => {
    useNotificationStore.getState().addNotification(makeNotif({ type: 'priority_alert' }));
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});

// ── addPriorityAlert ──────────────────────────────────────────────────────────

describe('addPriorityAlert', () => {
  it('adds a priority_alert to the queue', () => {
    const alert = makeNotif({ id: 'alert-1', type: 'priority_alert' });
    useNotificationStore.getState().addPriorityAlert(alert);
    expect(useNotificationStore.getState().priorityAlerts).toHaveLength(1);
  });

  it('prepends newer alerts to the front', () => {
    useNotificationStore.setState({
      priorityAlerts: [makeNotif({ id: 'old', type: 'priority_alert' })],
      notifications: [],
      unreadCount: 0,
    });
    useNotificationStore.getState().addPriorityAlert(makeNotif({ id: 'new', type: 'priority_alert' }));
    expect(useNotificationStore.getState().priorityAlerts[0].id).toBe('new');
  });

  it('ignores non-priority_alert types', () => {
    useNotificationStore.getState().addPriorityAlert(makeNotif({ type: 'mention' }));
    expect(useNotificationStore.getState().priorityAlerts).toHaveLength(0);
  });
});

// ── resolveAlert ──────────────────────────────────────────────────────────────

describe('resolveAlert', () => {
  it('removes the alert from priorityAlerts', async () => {
    vi.mocked(client.patch).mockResolvedValue({});
    useNotificationStore.setState({
      priorityAlerts: [makeNotif({ id: 'alert-1', type: 'priority_alert' })],
      notifications: [],
      unreadCount: 0,
    });

    await useNotificationStore.getState().resolveAlert('alert-1');

    expect(useNotificationStore.getState().priorityAlerts).toHaveLength(0);
  });

  it('folds the resolved alert into regular notifications', async () => {
    vi.mocked(client.patch).mockResolvedValue({});
    useNotificationStore.setState({
      priorityAlerts: [makeNotif({ id: 'alert-1', type: 'priority_alert' })],
      notifications: [],
      unreadCount: 0,
    });

    await useNotificationStore.getState().resolveAlert('alert-1');

    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe('alert-1');
    expect(notifications[0].is_resolved).toBe(1);
    expect(notifications[0].is_read).toBe(1);
  });

  it('calls PATCH /api/notifications/:id/resolve', async () => {
    vi.mocked(client.patch).mockResolvedValue({});
    useNotificationStore.setState({
      priorityAlerts: [makeNotif({ id: 'alert-1', type: 'priority_alert' })],
      notifications: [],
      unreadCount: 0,
    });

    await useNotificationStore.getState().resolveAlert('alert-1');

    expect(client.patch).toHaveBeenCalledWith('/api/notifications/alert-1/resolve');
  });
});

// ── markAllRead ───────────────────────────────────────────────────────────────

describe('markAllRead', () => {
  it('marks all notifications as read', async () => {
    vi.mocked(client.patch).mockResolvedValue({});
    useNotificationStore.setState({
      notifications: [makeNotif({ id: 'n1', is_read: 0 }), makeNotif({ id: 'n2', is_read: 0 })],
      priorityAlerts: [],
      unreadCount: 2,
    });

    await useNotificationStore.getState().markAllRead();

    const { notifications, unreadCount } = useNotificationStore.getState();
    expect(notifications.every(n => n.is_read === 1)).toBe(true);
    expect(unreadCount).toBe(0);
  });
});

// ── markRead ──────────────────────────────────────────────────────────────────

describe('markRead', () => {
  it('marks a specific notification as read', async () => {
    vi.mocked(client.patch).mockResolvedValue({});
    useNotificationStore.setState({
      notifications: [makeNotif({ id: 'n1', is_read: 0 }), makeNotif({ id: 'n2', is_read: 0 })],
      priorityAlerts: [],
      unreadCount: 2,
    });

    await useNotificationStore.getState().markRead('n1');

    const { notifications, unreadCount } = useNotificationStore.getState();
    expect(notifications.find(n => n.id === 'n1')?.is_read).toBe(1);
    expect(notifications.find(n => n.id === 'n2')?.is_read).toBe(0);
    expect(unreadCount).toBe(1);
  });

  it('does not decrement unreadCount for an already-read notification', async () => {
    vi.mocked(client.patch).mockResolvedValue({});
    useNotificationStore.setState({
      notifications: [makeNotif({ id: 'n1', is_read: 1 })],
      priorityAlerts: [],
      unreadCount: 0,
    });

    await useNotificationStore.getState().markRead('n1');

    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });
});
