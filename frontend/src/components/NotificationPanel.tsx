import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtSign, ClipboardCheck, Clock, RefreshCw, MessageSquare, AlertTriangle, type LucideIcon } from 'lucide-react';
import useNotificationStore from '../store/notificationStore';
import useWorkspaceStore from '../store/workspaceStore';
import useAuthStore from '../store/authStore';
import client from '../api/client';
import { formatDistanceToNow } from 'date-fns';
import type { Notification } from '../types';

// Priority tier: higher = more urgent
const PRIORITY: Record<string, number> = {
  task_due:            3,
  mention:             2,
  task_update_request: 2,
  task_assigned:       1,
  task_update_response: 1,
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
  task_due:             'Due',
  mention:              '@Mention',
  task_assigned:        'Task',
  priority_alert:       '✓ Alert',
  task_update_request:  'Update Request',
  task_update_response: 'Update',
};

const TYPE_LABEL_COLOR: Record<string, string> = {
  task_due:       'var(--danger)',
  mention:        '#C47B2A',
  task_assigned:  'var(--muted)',
  priority_alert: 'var(--faint)',  // resolved — very muted
};

const TYPE_ICON: Record<string, LucideIcon> = {
  mention:              AtSign,
  task_assigned:        ClipboardCheck,
  task_due:             Clock,
  task_update_request:  RefreshCw,
  task_update_response: MessageSquare,
  priority_alert:       AlertTriangle,
};

function NotificationList({ notifications, onNotifClick, markRead }: {
  notifications: Notification[];
  onNotifClick: (n: Notification) => void;
  markRead: (id: string) => void;
}) {
  const taskUpdateStatuses = useWorkspaceStore(s => s.taskUpdateStatuses);
  const [reasonNotifId, setReasonNotifId]       = useState<string | null>(null);
  const [reasonStatusValue, setReasonStatusValue] = useState<string>('');
  const [delayReason, setDelayReason]             = useState('');
  // Track in-flight submissions and locally-responded IDs (so they update immediately
  // before the store re-renders with is_read=1)
  const [submitting, setSubmitting] = useState<Set<string>>(new Set());
  const [respondedIds, setRespondedIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submitResponse = async (n: Notification, status: string, reason?: string) => {
    if (!n.extra_id || !n.reference_id) {
      setErrors(e => ({ ...e, [n.id]: 'Missing request data — try reloading the panel.' }));
      return;
    }
    setSubmitting(prev => new Set(prev).add(n.id));
    setErrors(e => { const next = { ...e }; delete next[n.id]; return next; });
    try {
      await client.post(`/api/task-updates/${n.extra_id}/respond`, {
        task_id: n.reference_id, status, reason: reason || undefined,
      });
      // Mark locally as responded so buttons disappear immediately
      setRespondedIds(prev => new Set(prev).add(n.id));
      markRead(n.id);
      setDelayedId(null);
      setDelayReason('');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Failed to send — try again.';
      setErrors(e => ({ ...e, [n.id]: msg }));
    } finally {
      setSubmitting(prev => { const s = new Set(prev); s.delete(n.id); return s; });
    }
  };

  return (
    <>
      {notifications.map(n => {
        const accent = TYPE_ACCENT[n.type] ?? 'transparent';
        const label  = TYPE_LABEL[n.type];
        const labelColor = TYPE_LABEL_COLOR[n.type] ?? 'var(--faint)';
        const isUnread = !n.is_read;
        // Show response buttons only for unread, non-responded update requests
        const showResponseButtons = n.type === 'task_update_request' && isUnread && !respondedIds.has(n.id);
        const isBusy = submitting.has(n.id);

        const NotifIcon = TYPE_ICON[n.type];
        const header = (
          <div className="flex items-baseline justify-between gap-2 mb-1">
            {(label || NotifIcon) && (
              <span className="flex items-center gap-1" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: labelColor }}>
                {NotifIcon && <NotifIcon size={11} style={{ color: labelColor, flexShrink: 0 }} />}
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
        );

        const messageEl = (
          <p style={{ fontSize: 13, color: isUnread ? 'var(--ink)' : 'var(--ink-2)', fontWeight: isUnread ? 500 : 400, lineHeight: 1.45 }}>
            {n.message}
          </p>
        );

        if (showResponseButtons) {
          return (
            <div key={n.id} className="flex gap-0"
              style={{ borderBottom: '1px solid var(--rule-2)', background: 'var(--paper-2)' }}>
              <span style={{ width: 3, flexShrink: 0, background: accent, alignSelf: 'stretch' }} />
              <div className="flex-1 min-w-0 px-4 py-3">
                {header}
                <button onClick={() => onNotifClick(n)} className="w-full text-left">
                  {messageEl}
                </button>

                {errors[n.id] && (
                  <p style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6 }}>{errors[n.id]}</p>
                )}

                {reasonNotifId === n.id ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <input
                      autoFocus
                      style={{ fontSize: 12, border: '1px solid var(--rule)', padding: '4px 8px', fontFamily: 'inherit', width: '100%', outline: 'none', borderRadius: 2 }}
                      placeholder="Add a reason… (optional)"
                      value={delayReason}
                      onChange={e => setDelayReason(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); submitResponse(n, reasonStatusValue, delayReason); }
                        if (e.key === 'Escape') { setReasonNotifId(null); setDelayReason(''); }
                      }}
                    />
                    <div className="flex items-baseline gap-3">
                      <button className="btn-primary" disabled={isBusy}
                        onClick={() => submitResponse(n, reasonStatusValue, delayReason)}>
                        {isBusy ? 'Sending…' : 'Send →'}
                      </button>
                      <button className="btn-ghost"
                        onClick={() => { setReasonNotifId(null); setDelayReason(''); }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {taskUpdateStatuses.map(s => (
                        <button key={s.value} disabled={isBusy}
                          style={{
                            fontSize: 11, fontWeight: 500, color: s.color,
                            border: `1px solid ${s.color}`, padding: '2px 9px',
                            fontFamily: 'inherit', opacity: isBusy ? 0.5 : 1,
                          }}
                          onClick={() => {
                            if (s.requiresReason) {
                              setReasonNotifId(n.id);
                              setReasonStatusValue(s.value);
                              return;
                            }
                            submitResponse(n, s.value);
                          }}>
                          {isBusy ? '…' : s.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        }

        return (
          <button key={n.id} onClick={() => onNotifClick(n)} className="w-full text-left flex gap-0"
            style={{ borderBottom: '1px solid var(--rule-2)', background: isUnread ? 'var(--paper-2)' : 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = isUnread ? 'var(--paper-2)' : 'transparent')}>
            <span style={{ width: 3, flexShrink: 0, background: isUnread ? accent : 'transparent', alignSelf: 'stretch' }} />
            <div className="flex-1 min-w-0 px-4 py-3">
              {header}
              {messageEl}
            </div>
          </button>
        );
      })}
    </>
  );
}

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
    if (n.type === 'task_update_request' && n.reference_id) {
      try {
        const { data } = await client.get<{ board_id: string; task_key: string | null }>(
          `/api/task-updates/notification/${n.reference_id}`
        );
        if (data.task_key) {
          navigate(`/board/${data.board_id}?taskKey=${data.task_key}`);
        } else {
          navigate(`/board/${data.board_id}?updates=1`);
        }
      } catch {}
    }
    if (n.type === 'task_update_response' && n.reference_id) {
      try {
        const { data } = await client.get<{ board_id: string }>(
          `/api/task-updates/notification/${n.reference_id}`
        );
        navigate(`/board/${data.board_id}?updates=1`);
      } catch {}
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
          <NotificationList
            notifications={sorted}
            onNotifClick={handleNotifClick}
            markRead={markRead}
          />
        )}
      </div>
    </div>
  );
}
