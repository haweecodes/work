import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtSign, ClipboardCheck, Clock, RefreshCw, MessageSquare, AlertTriangle, ChevronDown, ChevronRight, X, type LucideIcon } from 'lucide-react';
import useNotificationStore from '../store/notificationStore';
import useAuthStore from '../store/authStore';
import useUIStore from '../store/uiStore';
import client from '../api/client';
import { formatDistanceToNow } from 'date-fns';
import type { Notification } from '../types';

// Priority tier: higher = more urgent (used for inbox sort order)
const PRIORITY: Record<string, number> = {
  task_due:             3,
  mention:              2,
  task_update_request:  2,
  task_assigned:        1,
  task_update_response: 1,
};

// Types that require action from the user
const ACTION_TYPES = new Set(['mention', 'task_update_request', 'task_due']);

const MENTION_PRIORITY_COLORS: Record<string, string> = {
  high: '#C47B2A', urgent: 'var(--danger)',
};

const TYPE_ACCENT: Record<string, string> = {
  task_due:       'var(--danger)',
  mention:        '#C47B2A',
  task_assigned:  'var(--ink-2)',
  priority_alert: 'var(--rule)',
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
  priority_alert: 'var(--faint)',
};

const TYPE_ICON: Record<string, LucideIcon> = {
  mention:              AtSign,
  task_assigned:        ClipboardCheck,
  task_due:             Clock,
  task_update_request:  RefreshCw,
  task_update_response: MessageSquare,
  priority_alert:       AlertTriangle,
};

// ─── Grouping ────────────────────────────────────────────────────────────────

type SingleItem = { kind: 'single'; n: Notification };
type GroupItem  = { kind: 'group';  refId: string; items: Notification[]; latestAt: string };
type DisplayItem = SingleItem | GroupItem;

function buildDisplayItems(notifications: Notification[], filter: 'inbox' | 'all'): DisplayItem[] {
  // Only show unread in inbox mode
  const visible = filter === 'inbox' ? notifications.filter(n => !n.is_read) : notifications;

  // Group task_update_response by reference_id (request ID)
  const responseGroups = new Map<string, Notification[]>();
  const singles: Notification[] = [];

  for (const n of visible) {
    if (n.type === 'task_update_response' && n.reference_id) {
      if (!responseGroups.has(n.reference_id)) responseGroups.set(n.reference_id, []);
      responseGroups.get(n.reference_id)!.push(n);
    } else {
      singles.push(n);
    }
  }

  const items: DisplayItem[] = singles.map(n => ({ kind: 'single', n }));

  for (const [refId, group] of responseGroups) {
    if (group.length === 1) {
      items.push({ kind: 'single', n: group[0] });
    } else {
      const latestAt = group.reduce((latest, n) =>
        new Date(n.created_at) > new Date(latest) ? n.created_at : latest,
        group[0].created_at
      );
      items.push({ kind: 'group', refId, items: group, latestAt });
    }
  }

  // Sort: priority tier desc, then date desc
  return items.sort((a, b) => {
    const typeA = a.kind === 'single' ? a.n.type : 'task_update_response';
    const typeB = b.kind === 'single' ? b.n.type : 'task_update_response';
    const pa = PRIORITY[typeA] ?? 0;
    const pb = PRIORITY[typeB] ?? 0;
    if (pb !== pa) return pb - pa;
    const dateA = a.kind === 'single' ? a.n.created_at : a.latestAt;
    const dateB = b.kind === 'single' ? b.n.created_at : b.latestAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
}

// ─── Single card ─────────────────────────────────────────────────────────────

function NotifCard({ n, onNavigate, onDismiss }: {
  n: Notification;
  onNavigate: (n: Notification) => void;
  onDismiss: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const accent     = TYPE_ACCENT[n.type] ?? 'transparent';
  const label      = TYPE_LABEL[n.type];
  const labelColor = TYPE_LABEL_COLOR[n.type] ?? 'var(--faint)';
  const isUnread   = !n.is_read;
  const NotifIcon  = TYPE_ICON[n.type];

  return (
    <div
      className="flex gap-0 relative"
      style={{ borderBottom: '1px solid var(--rule-2)', background: hovered || isUnread ? 'var(--paper-2)' : 'transparent' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ width: 3, flexShrink: 0, background: isUnread ? accent : 'transparent', alignSelf: 'stretch' }} />
      <button
        className="flex-1 min-w-0 px-4 py-3 text-left"
        onClick={() => onNavigate(n)}
      >
        <div className="flex items-baseline justify-between gap-2 mb-1">
          {(label || !!NotifIcon) && (
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
        <p style={{ fontSize: 13, color: isUnread ? 'var(--ink)' : 'var(--ink-2)', fontWeight: isUnread ? 500 : 400, lineHeight: 1.45 }}>
          {n.message}
        </p>
      </button>

      {/* Hover dismiss */}
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onDismiss(n.id); }}
          style={{ position: 'absolute', top: 8, right: 8, color: 'var(--faint)', padding: 2, lineHeight: 1 }}
          title="Dismiss"
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Grouped response card ────────────────────────────────────────────────────

function GroupCard({ group, expanded, onToggle, onNavigateItem, onDismissAll }: {
  group: GroupItem;
  expanded: boolean;
  onToggle: () => void;
  onNavigateItem: (n: Notification) => void;
  onDismissAll: (ids: string[]) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const unreadCount = group.items.filter(n => !n.is_read).length;
  const hasUnread = unreadCount > 0;

  return (
    <div style={{ borderBottom: '1px solid var(--rule-2)' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>

      {/* Group header row */}
      <div className="relative flex items-start gap-0" style={{ background: hovered || hasUnread ? 'var(--paper-2)' : 'transparent' }}>
        <span style={{ width: 3, flexShrink: 0, background: hasUnread ? 'var(--ink-2)' : 'transparent', alignSelf: 'stretch' }} />
        <button className="flex-1 min-w-0 px-4 py-3 text-left" onClick={onToggle}>
          <div className="flex items-center gap-1.5 mb-1">
            <MessageSquare size={11} style={{ color: 'var(--faint)', flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)' }}>
              Update
            </span>
            <span style={{ fontSize: 11, color: 'var(--faint)', marginLeft: 'auto' }}>
              {formatDistanceToNow(new Date(group.latestAt), { addSuffix: true })}
            </span>
            {expanded ? <ChevronDown size={11} style={{ color: 'var(--faint)', flexShrink: 0 }} /> : <ChevronRight size={11} style={{ color: 'var(--faint)', flexShrink: 0 }} />}
          </div>
          <p style={{ fontSize: 13, color: hasUnread ? 'var(--ink)' : 'var(--ink-2)', fontWeight: hasUnread ? 500 : 400, lineHeight: 1.45 }}>
            {group.items.length} responses to your update request
            {unreadCount > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: 'var(--paper)', background: 'var(--ink-2)', padding: '1px 5px' }}>
                {unreadCount} new
              </span>
            )}
          </p>
        </button>

        {hovered && (
          <button
            onClick={e => { e.stopPropagation(); onDismissAll(group.items.map(n => n.id)); }}
            style={{ position: 'absolute', top: 8, right: 8, color: 'var(--faint)', padding: 2, lineHeight: 1 }}
            title="Dismiss all"
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Expanded individual responses */}
      {expanded && (
        <div style={{ paddingBottom: 4 }}>
          {group.items.map(n => (
            <button key={n.id} onClick={() => onNavigateItem(n)} className="w-full text-left flex items-baseline gap-3"
              style={{ padding: '6px 16px 6px 20px', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: n.is_read ? 'transparent' : 'var(--ink)', flexShrink: 0, marginTop: 5 }} />
              <span style={{ color: n.is_read ? 'var(--ink-2)' : 'var(--ink)', flex: 1, fontWeight: n.is_read ? 400 : 500 }}>
                {n.message}
              </span>
              <span style={{ fontSize: 11, color: 'var(--faint)', flexShrink: 0 }}>
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export default function NotificationPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const openSidebar = useUIStore(s => s.openSidebar);
  const notifications = useNotificationStore(s => s.notifications);
  const unreadCount   = useNotificationStore(s => s.unreadCount);
  const markAllRead   = useNotificationStore(s => s.markAllRead);
  const markRead      = useNotificationStore(s => s.markRead);
  const panelRef = useRef<HTMLDivElement>(null);

  const [filter, setFilter] = useState<'inbox' | 'all'>('inbox');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function navigate_to(n: Notification) {
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
      return;
    }
    if (n.type === 'task_update_request') {
      openSidebar({ type: 'task-updates' });
      return;
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

  function dismiss(id: string) {
    markRead(id);
  }

  function dismissAll(ids: string[]) {
    ids.forEach(id => markRead(id));
  }

  function toggleGroup(refId: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(refId)) next.delete(refId); else next.add(refId);
      return next;
    });
  }

  const displayItems = buildDisplayItems(notifications, filter);
  const inboxCount = notifications.filter(n => !n.is_read).length;

  return (
    <div ref={panelRef} className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--rule)' }}>
        {/* Filter tabs */}
        <div className="flex items-center gap-1">
          {(['inbox', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                fontSize: 11, fontWeight: filter === f ? 600 : 400,
                letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                color: filter === f ? 'var(--ink)' : 'var(--faint)',
                paddingBottom: 2,
                borderBottom: filter === f ? '1px solid var(--ink)' : '1px solid transparent',
              }}>
              {f === 'inbox' ? 'Inbox' : 'All'}
            </button>
          ))}
          {inboxCount > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: 'var(--paper)', background: ACTION_TYPES.has(notifications.find(n => !n.is_read)?.type ?? '') ? 'var(--danger)' : 'var(--ink-2)',
              minWidth: 18, height: 18, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', padding: '0 5px',
              marginLeft: 6,
            }}>
              {inboxCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {unreadCount > 0 && user && (
            <button onClick={() => markAllRead()}
              style={{ fontSize: 11, color: 'var(--muted)' }}
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

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {displayItems.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>
              {filter === 'inbox' ? 'All caught up' : 'No notifications'}
            </p>
          </div>
        ) : (
          displayItems.map(item => {
            if (item.kind === 'single') {
              return (
                <NotifCard
                  key={item.n.id}
                  n={item.n}
                  onNavigate={navigate_to}
                  onDismiss={dismiss}
                />
              );
            }
            return (
              <GroupCard
                key={item.refId}
                group={item}
                expanded={expandedGroups.has(item.refId)}
                onToggle={() => toggleGroup(item.refId)}
                onNavigateItem={navigate_to}
                onDismissAll={dismissAll}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
