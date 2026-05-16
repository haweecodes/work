import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useNotificationStore from '../store/notificationStore';
import useAuthStore from '../store/authStore';
import client from '../api/client';
import { formatDistanceToNow } from 'date-fns';
import type { Notification } from '../types';

// Priority tier: higher = more urgent
const PRIORITY: Record<string, number> = {
  task_due:      3,
  mention:       2,
  task_assigned: 1,
};

const MENTION_PRIORITY_COLORS: Record<string, string> = {
  high: '#C47B2A', urgent: 'var(--danger)',
};

// Left-border accent per type (quiet but distinct)
const TYPE_ACCENT: Record<string, string> = {
  task_due:       'var(--danger)',
  mention:        '#C47B2A',
  task_assigned:  'var(--ink-2)',
  priority_alert: 'var(--rule)',   // resolved — grey, history only
};

const TYPE_LABEL: Record<string, string> = {
  task_due:       'Due',
  mention:        '@Mention',
  task_assigned:  'Task',
  priority_alert: '✓ Alert',       // resolved priority alert
};

const TYPE_LABEL_COLOR: Record<string, string> = {
  task_due:       'var(--danger)',
  mention:        '#C47B2A',
  task_assigned:  'var(--muted)',
  priority_alert: 'var(--faint)',  // resolved — very muted
};

export default function NotificationPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const { notifications, unreadCount, markAllRead, markRead } = useNotificationStore();
  const panelRef = useRef<HTMLDivElement>(null);

  // Notifications are loaded by AppLayout on mount — no refetch here
  // so opening the panel never triggers the priority alert overlay

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleNotifClick(n: Notification) {
    markRead(n.id);
    onClose();
    if ((n.type === 'task_assigned' || n.type === 'task_due') && n.reference_id) {
      try {
        const { data } = await client.get<{ board_id: string; task_key: string }>(
          `/api/tasks/detail/${n.reference_id}`
        );
        navigate(`/board/${data.board_id}?taskKey=${data.task_key}`);
      } catch { /* task deleted */ }
      return;
    }
    if (n.type === 'mention' && n.reference_type === 'channel' && n.reference_id) {
      navigate(`/channel/${n.reference_id}`);
    }
  }

  // Sort by priority tier (urgent first), then by date
  const sorted = [...notifications].sort((a, b) => {
    const pa = PRIORITY[a.type] ?? 0;
    const pb = PRIORITY[b.type] ?? 0;
    if (pb !== pa) return pb - pa;
    // For two mentions, break ties by mention priority (urgent > high > normal > low)
    if (a.type === 'mention' && b.type === 'mention') {
      const mentionOrder: Record<string, number> = { urgent: 3, high: 2, normal: 1, low: 0 };
      const ma = mentionOrder[a.priority ?? 'normal'] ?? 1;
      const mb = mentionOrder[b.priority ?? 'normal'] ?? 1;
      if (mb !== ma) return mb - ma;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div
      ref={panelRef}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-baseline justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--rule)' }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)' }}>
            Notifications
          </span>
          {unreadCount > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: 'var(--paper)', background: 'var(--danger)',
              minWidth: 18, height: 18, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', padding: '0 5px',
            }}>
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {unreadCount > 0 && user && (
            <button onClick={() => markAllRead()}
              style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.textDecoration = 'none'; }}>
              Mark all read
            </button>
          )}
          <button onClick={onClose}
            style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--faint)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {sorted.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>All caught up</p>
          </div>
        ) : (
          sorted.map(n => {
            const accent = TYPE_ACCENT[n.type] ?? 'transparent';
            const label  = TYPE_LABEL[n.type];
            const labelColor = TYPE_LABEL_COLOR[n.type] ?? 'var(--faint)';
            const isUnread = !n.is_read;

            return (
              <button
                key={n.id}
                onClick={() => handleNotifClick(n)}
                className="w-full text-left flex gap-0"
                style={{
                  borderBottom: '1px solid var(--rule-2)',
                  background: isUnread ? 'var(--paper-2)' : 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = isUnread ? 'var(--paper-2)' : 'transparent')}
              >
                {/* Priority accent bar */}
                <span style={{ width: 3, flexShrink: 0, background: isUnread ? accent : 'transparent', alignSelf: 'stretch' }} />

                <div className="flex-1 min-w-0 px-4 py-3">
                  {/* Type label + timestamp */}
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    {label && (
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: labelColor }}>
                        {label}
                      </span>
                    )}
                    {n.type === 'mention' && n.priority && MENTION_PRIORITY_COLORS[n.priority] && (
                      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: MENTION_PRIORITY_COLORS[n.priority] }}>
                        {n.priority}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--faint)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em', marginLeft: 'auto', flexShrink: 0 }}>
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Message */}
                  <p style={{
                    fontSize: 13,
                    color: isUnread ? 'var(--ink)' : 'var(--ink-2)',
                    fontWeight: isUnread ? 500 : 400,
                    lineHeight: 1.45,
                  }}>
                    {n.message}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
