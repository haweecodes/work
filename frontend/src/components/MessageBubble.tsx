import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format, addDays } from 'date-fns';
import useAuthStore from '../store/authStore';
import useUIStore from '../store/uiStore';
import useBoardStore from '../store/boardStore';
import useWorkspaceStore from '../store/workspaceStore';
import MessageActionBar from './MessageActionBar';
import SendPriorityAlertModal from './SendPriorityAlertModal';
import UserAvatar from './UserAvatar';
import client from '../api/client';
import type { Message, Reaction, Task, Member } from '../types';

// ── Smart suggestion detection ────────────────────────────────────────────────
// Keyword heuristic — labels as "Smart suggestion", not "AI", to be honest.
const TASK_KEYWORDS = /\b(deadline|submit|review|update|schedule|send|prepare|finish|complete|fix|create|write|check|follow.?up)\b/i;
const OPP_KEYWORDS  = /\b(interested|proposal|deal|enterprise|contract|meeting|demo|budget|purchase|pricing)\b/i;

function detectAiType(content: string): 'task' | 'opportunity' | null {
  if (OPP_KEYWORDS.test(content) && content.length > 60) return 'opportunity';
  if (TASK_KEYWORDS.test(content) && content.length > 40) return 'task';
  return null;
}

const DISMISSED_KEY = 'fw_suggestion_dismissed';

function getSuggestionDismissed(msgId: string): boolean {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    const ids: string[] = stored ? JSON.parse(stored) : [];
    return ids.includes(msgId);
  } catch {
    return false;
  }
}

function setSuggestionDismissed(msgId: string) {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    const ids: string[] = stored ? JSON.parse(stored) : [];
    if (!ids.includes(msgId)) {
      // Keep only last 500 dismissals to prevent unbounded growth
      const next = [...ids, msgId].slice(-500);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    }
  } catch { /* ignore storage errors */ }
}

// ── Task creation utilities ───────────────────────────────────────────────────

/** Strip conversational filler and truncate to a clean task title. */
function buildSmartTitle(content: string): string {
  if (!content.trim()) return 'New Task';
  const first = content.split(/[.!?\n]/)[0].trim();
  const stripped = first
    .replace(/^(hey\s+(team|all|everyone|guys)[,!.]?\s*)/i, '')
    .replace(/^(hi[,!.]?\s*|fyi[,!.:]\s*|reminder[,!.:]\s*|heads up[,!.:]\s*)/i, '')
    .replace(/^(can (someone|you|we)|could (someone|you|we)|please|don't forget to|we need to|we should|make sure (to )?)\s+/i, '')
    .trim();
  const titled = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return titled.slice(0, 80) || first.slice(0, 80);
}

/** Extract a due date from common temporal phrases in a message. */
function extractDueDate(content: string): string | null {
  const t = content.toLowerCase();
  const today = new Date();
  const fromNow = (n: number) => format(addDays(today, n), 'yyyy-MM-dd');
  /** Next occurrence of a weekday (0=Sun…6=Sat); if today IS that day, skip to next week. */
  const nextWeekday = (target: number) => {
    const diff = (target - today.getDay() + 7) % 7;
    return fromNow(diff || 7);
  };

  if (/\b(today|eod|end of day)\b/.test(t))  return fromNow(0);
  if (/\btomorrow\b/.test(t))                 return fromNow(1);
  if (/\bmonday\b/.test(t))                   return nextWeekday(1);
  if (/\btuesday\b/.test(t))                  return nextWeekday(2);
  if (/\bwednesday\b/.test(t))                return nextWeekday(3);
  if (/\bthursday\b/.test(t))                 return nextWeekday(4);
  if (/\b(friday|end of (the )?week)\b/.test(t)) return nextWeekday(5);
  if (/\bnext week\b/.test(t))                return fromNow(7);
  return null;
}

/** Return IDs of members @-mentioned in the message.
 *  Matches @FullName and @FirstName (case-insensitive). */
function extractMentionedIds(content: string, members: Member[]): string[] {
  const lower = content.toLowerCase();
  return members.filter(m => {
    const fullName  = m.name.toLowerCase();
    const firstName = m.name.split(' ')[0].toLowerCase();
    return lower.includes(`@${fullName}`) || lower.includes(`@${firstName}`);
  }).map(m => m.id);
}

// ── Smart Suggestion Banner ───────────────────────────────────────────────────
function SmartSuggestionBanner({
  type,
  onConvert,
  onDismiss,
}: {
  type: 'task' | 'opportunity';
  onConvert: () => void;
  onDismiss: () => void;
}) {
  const isTask = type === 'task';
  return (
    <div
      className="mt-2 rounded-lg overflow-hidden border animate-fade-in"
      style={isTask
        ? { borderColor: '#FDE68A', background: '#FFFBEB' }
        : { borderColor: '#C4B5FD', background: '#EDE9FE' }
      }
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-semibold"
        style={{ color: isTask ? '#D97706' : '#7C3AED' }}
      >
        {isTask ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        )}
        {isTask ? 'Smart suggestion — possible task' : 'Smart suggestion — possible opportunity'}
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
        <span className="text-[13px] text-gray-700 leading-snug flex-1 italic">
          {isTask ? 'Convert this message to a board task.' : 'Add this conversation to your pipeline.'}
        </span>
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={onConvert}
            className="px-2.5 py-1 rounded-md text-[12px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: isTask ? '#D97706' : '#7C3AED' }}
          >
            {isTask ? 'Convert' : 'Add to Pipeline'}
          </button>
          <button
            onClick={onDismiss}
            className="px-2 py-1 rounded-md text-[12px] font-medium border transition-colors hover:bg-gray-50"
            style={{ color: '#6B7280', borderColor: '#E5E7EB', background: 'transparent' }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline task form ──────────────────────────────────────────────────────────
export interface InlineTaskPrefill {
  title: string;
  priority: string;
  dueDate: string;
}

function InlineTaskForm({
  msg,
  prefill,
  defaultDueDate,
  onClose,
  onSuccess,
}: {
  msg: Message;
  prefill: string;
  defaultDueDate?: string | null;
  onClose: () => void;
  onSuccess: (task: Task) => void;
}) {
  const boards       = useBoardStore(s => s.boards);
  const storeColumns = useBoardStore(s => s.columns);
  const members      = useWorkspaceStore(s => s.members);
  const [title, setTitle] = useState(prefill.slice(0, 120));
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState(defaultDueDate ?? '');
  const [selectedBoardId, setSelectedBoardId] = useState(boards[0]?.id ?? '');
  const [colOptions, setColOptions] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedColId, setSelectedColId] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() => extractMentionedIds(msg.content, members));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load columns whenever the selected board changes
  useEffect(() => {
    if (!selectedBoardId) return;
    // Re-use store columns if they're already loaded for this board
    if (storeColumns.length > 0 && storeColumns[0]?.board_id === selectedBoardId) {
      const opts = storeColumns.map(c => ({ id: c.id, title: c.title }));
      setColOptions(opts);
      const todo = storeColumns.find(c => /to.?do|todo|backlog/i.test(c.title)) ?? storeColumns[0];
      setSelectedColId(todo?.id ?? '');
      return;
    }
    // Otherwise fetch directly (local to this form — doesn't overwrite global store)
    client.get<Array<{ id: string; title: string }>>(`/api/boards/${selectedBoardId}/columns`)
      .then(({ data }) => {
        setColOptions(data.map(c => ({ id: c.id, title: c.title })));
        const todo = data.find(c => /to.?do|todo|backlog/i.test(c.title)) ?? data[0];
        setSelectedColId(todo?.id ?? '');
      })
      .catch(() => setColOptions([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoardId]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    if (!selectedBoardId) { setError('No board configured.'); return; }
    if (!selectedColId) { setError('Select a column first.'); return; }
    setSaving(true);
    setError('');
    try {
      const { data } = await client.post<Task>('/api/tasks', {
        board_id: selectedBoardId,
        column_id: selectedColId,
        title: title.trim(),
        priority,
        due_date: dueDate || undefined,
        assignee_ids: assigneeIds.length ? assigneeIds : undefined,
        linked_message_id: msg.id,
      });
      onSuccess(data);
    } catch {
      setError('Failed to create task.');
      setSaving(false);
    }
  };

  return (
    <div
      className="mt-2"
      onClick={e => e.stopPropagation()}
      style={{ borderLeft: '2px solid var(--rule)', paddingLeft: 12, paddingTop: 8, paddingBottom: 8 }}
    >
      {/* Heading */}
      <div className="label mb-3" style={{ marginBottom: 10 }}>Create task from message</div>

      {/* Title */}
      <div className="mb-3">
        <label className="label">Title</label>
        <input
          autoFocus
          className="input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
        />
      </div>

      {/* Board + Column */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <label className="label">Board</label>
          <select className="input" value={selectedBoardId} onChange={e => setSelectedBoardId(e.target.value)}>
            {boards.length === 0
              ? <option value="">No boards yet</option>
              : boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
            }
          </select>
        </div>
        <div>
          <label className="label">Column</label>
          <select className="input" value={selectedColId} onChange={e => setSelectedColId(e.target.value)}
            disabled={colOptions.length === 0}>
            {colOptions.length === 0
              ? <option value="">Loading…</option>
              : colOptions.map(c => <option key={c.id} value={c.id}>{c.title}</option>)
            }
          </select>
        </div>
      </div>

      {/* Priority + Due date */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <label className="label">Priority</label>
          <select className="input" value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="label">Due date</label>
          <input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
      </div>

      {/* Assignees */}
      {members.length > 0 && (
        <div className="mb-3">
          <label className="label">Assignees</label>
          <div className="flex flex-wrap gap-3 mt-1">
            {members.map(m => {
              const selected = assigneeIds.includes(m.id);
              return (
                <button key={m.id} type="button"
                  onClick={() => setAssigneeIds(prev => selected ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                  className="flex items-center gap-1.5"
                  style={{ fontSize: 13, color: selected ? 'var(--ink)' : 'var(--muted)', fontWeight: selected ? 500 : 400, borderBottom: `1px solid ${selected ? 'var(--ink)' : 'transparent'}`, paddingBottom: 1 }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                  onMouseLeave={e => { if (!selected) e.currentTarget.style.color = 'var(--muted)'; }}>
                  <img src={m.avatar_url} className="w-4 h-4 rounded-full" alt={m.name} />
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{error}</p>}

      {/* Actions */}
      <div className="flex items-baseline gap-5">
        <button onClick={handleSubmit} disabled={saving || !title.trim()} className="btn-primary">
          {saving ? 'Saving…' : 'Add to board →'}
        </button>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface MessageBubbleProps {
  msg: Message;
  onCreateTask?: (msg: Message, prefill?: InlineTaskPrefill) => void;
  onTaskLinked?: (msgId: string, task: Task) => void;
  onMessageUpdated?: (msgId: string, content: string) => void;
  onMessageDeleted?: (msgId: string) => void;
  onReply?: (msg: Message) => void;
  onShare?: (msg: Message) => void;
  onReactionToggle?: (messageId: string, reactions: Reaction[]) => void;
  depth?: number;
  inThread?: boolean;
  replyTo?: Message;
  /** True when the previous message is from the same sender within 5 minutes — hides avatar + header */
  isContinuation?: boolean;
  /** True when the next message starts a new group — shows the row separator */
  isGroupEnd?: boolean;
}

const MENTION_PRIORITY_COLORS: Record<string, string> = {
  low: 'var(--faint)', normal: 'var(--ink)', high: '#C47B2A', urgent: 'var(--danger)',
};

function MessageBubble({
  msg,
  onCreateTask,
  onTaskLinked,
  onMessageUpdated,
  onMessageDeleted,
  onReply,
  onShare,
  onReactionToggle,
  depth = 0,
  inThread = false,
  replyTo,
  isContinuation = false,
  isGroupEnd = true,
}: MessageBubbleProps) {
  const user             = useAuthStore(s => s.user);
  const threadUnread     = useUIStore(s => s.threadUnread);
  const openSidebar      = useUIStore(s => s.openSidebar);
  const navigate         = useNavigate();
  const boards           = useBoardStore(s => s.boards);
  const columns          = useBoardStore(s => s.columns);
  const fetchColumns     = useBoardStore(s => s.fetchColumns);
  const selectedTask     = useBoardStore(s => s.selectedTask);
  const setSelectedTask  = useBoardStore(s => s.setSelectedTask);
  const updateTaskInColumn = useBoardStore(s => s.updateTaskInColumn);
  const members          = useWorkspaceStore(s => s.members);

  const mentionSplitRe = useMemo(() => {
    const sorted = [...members]
      .sort((a, b) => b.name.length - a.name.length)
      .map(m => m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const mentionAlt = sorted.length > 0 ? `@(?:${sorted.join('|')})` : '@\\w+';
    // Order matters: ** before * to avoid mis-matching bold as italic
    return new RegExp(
      `(\\*\\*[^*]+\\*\\*|\\*[^*]+\\*|\`[^\`]+\`|\\[[^\\]]+\\]\\([^)]+\\)|${mentionAlt})`,
      'gi'
    );
  }, [members]);

  const [reactions, setReactions] = useState<Reaction[]>(msg.reactions ?? []);
  const [aiDismissed, setAiDismissed] = useState(() => getSuggestionDismissed(msg.id));
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [inlineCreated, setInlineCreated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const [editSaving, setEditSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [deleteInFlight, setDeleteInFlight] = useState(false);
  const [quickCreatedTask, setQuickCreatedTask] = useState<Task | null>(null);
  const toggleRef = useRef<(emoji: string) => void>(() => {});

  const isOwn = !!user && msg.sender_id === user.id;

  const handleEdit = () => { setEditing(true); setEditContent(msg.content); };

  const handleEditSave = async () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === msg.content) { setEditing(false); return; }
    setEditSaving(true);
    try {
      await client.patch(`/api/channels/messages/${msg.id}`, { content: trimmed });
      onMessageUpdated?.(msg.id, trimmed);
      setEditing(false);
    } catch {
      // leave editing open so user can retry
    } finally {
      setEditSaving(false);
    }
  };

  // Opens the inline confirmation bar instead of the browser dialog
  const handleDelete = () => setShowDeleteConfirm(true);

  const handleDeleteConfirm = async () => {
    setDeleteInFlight(true);
    try {
      await client.delete(`/api/channels/messages/${msg.id}`);
      onMessageDeleted?.(msg.id);
    } catch {
      setDeleteInFlight(false);
      setShowDeleteConfirm(false);
    }
  };

  // ── 1-click task creation ─────────────────────────────────────────────────
  // If a task is already linked, just open it. Otherwise create immediately
  // with smart defaults and fall back to the inline form only on failure.
  const handleQuickCreateTask = async () => {
    if (msg.linked_task) { setSelectedTask(msg.linked_task); return; }

    const board = boards[0];
    let boardColumns = columns;

    // Lazy-load columns when not yet fetched (e.g. DM view)
    if (board && boardColumns.length === 0) {
      await fetchColumns(board.id);
      boardColumns = useBoardStore.getState().columns;
    }

    const todoCol = boardColumns.find(c => /to.?do|todo|backlog/i.test(c.title)) ?? boardColumns[0];

    if (!board || !todoCol || !user) {
      setShowInlineForm(true); // fallback: no board configured
      return;
    }

    const title       = buildSmartTitle(msg.content);
    const dueDate     = extractDueDate(msg.content);
    const assigneeIds = extractMentionedIds(msg.content, members);

    try {
      const { data } = await client.post<Task>('/api/tasks', {
        board_id:          board.id,
        column_id:         todoCol.id,
        title,
        priority:          'medium',
        due_date:          dueDate ?? undefined,
        assignee_ids:      assigneeIds.length ? assigneeIds : undefined,
        linked_message_id: msg.id,
      });
      setQuickCreatedTask(data);
      setInlineCreated(true);
      onTaskLinked?.(msg.id, data);
      updateTaskInColumn(data);
      setSelectedTask(data);
    } catch {
      setShowInlineForm(true); // fallback to form if API fails
    }
  };

  const aiType = !msg.is_system && !msg.shared_message ? detectAiType(msg.content) : null;
  const showAiBanner = !!aiType && !aiDismissed && !msg.linked_task && !inlineCreated;

  // Prefer live socket-pushed reactions over local state
  const effectiveReactions = msg.reactions ?? reactions;

  const handleReactionsChange = (next: Reaction[]) => {
    setReactions(next);
    onReactionToggle?.(msg.id, next);
  };

  const handleInlineSuccess = (task: Task) => {
    setShowInlineForm(false);
    setInlineCreated(true);
    onTaskLinked?.(msg.id, task);
  };

  const renderedContent = useMemo(() => {
    const parts = msg.content.split(mentionSplitRe);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} style={{ fontFamily: 'monospace', fontSize: '0.88em', background: 'var(--paper-2)', padding: '1px 4px' }}>{part.slice(1, -1)}</code>;
      }
      if (part.startsWith('[') && part.includes('](')) {
        const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (match) {
          return <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'underline' }}>{match[1]}</a>;
        }
      }
      if (part.startsWith('@')) {
        const mentionName = part.slice(1);
        const mp = msg.mention_priorities?.find(m => m.name.toLowerCase() === mentionName.toLowerCase());
        const color = mp ? (MENTION_PRIORITY_COLORS[mp.priority] ?? 'var(--ink)') : 'var(--ink)';
        return <span key={i} style={{ fontWeight: 600, color }}>{part}</span>;
      }
      return part;
    });
  }, [msg.content, mentionSplitRe, msg.mention_priorities]);

  const handleGoToSource = () => {
    const sm = msg.shared_message;
    if (!sm) return;
    const threadParam = sm.parent_message_id ? `?threadId=${sm.parent_message_id}` : '';
    if (sm.channel_id) {
      navigate(`/channel/${sm.channel_id}${threadParam}`);
    } else if (sm.dm_thread_id) {
      navigate(`/dm/${sm.dm_thread_id}${threadParam}`);
    }
  };

  // ── System message ──────────────────────────────────────────────────────────
  if (msg.is_system === 1) {
    const isTaskLink = !!msg.linked_task;
    const sysText = (() => {
      if (msg.content.startsWith('{')) {
        try {
          const p = JSON.parse(msg.content);
          if (p.type === 'task_assigned') {
            if (msg.channel_id) return `${p.actorName} assigned a task to ${p.assigneeName}: ${p.taskTitle}`;
            if (p.actorId === user?.id) return `You assigned: ${p.taskTitle}`;
            return `Assigned you to: ${p.taskTitle}`;
          }
          if (p.type === 'task_unassigned') {
            if (msg.channel_id) return `${p.actorName} removed ${p.assigneeName} from: ${p.taskTitle}`;
            if (p.actorId === user?.id) return `You removed them from: ${p.taskTitle}`;
            return `Removed you from: ${p.taskTitle}`;
          }
        } catch {}
      }
      return msg.content;
    })();
    return (
      <div data-msg-id={msg.id} className="px-6 py-2"
        style={{ borderBottom: isGroupEnd ? '1px solid var(--rule-2)' : 'none' }}>
        <div className="flex items-baseline gap-2">
          <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 500 }}>system</span>
          <span style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>{sysText}</span>
          {isTaskLink && (
            <button
              onClick={() => { if (msg.linked_task && selectedTask?.id !== msg.linked_task.id) setSelectedTask(msg.linked_task); }}
              style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'none', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.textDecoration = 'none'; }}>
              view →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Deleted message placeholder ─────────────────────────────────────────────
  if (msg.deleted) {
    return (
      <div data-msg-id={msg.id} className="px-6 py-2"
        style={{ borderBottom: isGroupEnd ? '1px solid var(--rule-2)' : 'none' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-2)' }}>{msg.sender?.name || 'Member'}</span>
        <span style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic', marginLeft: 10 }}>
          — message deleted —
        </span>
      </div>
    );
  }

  // ── Normal message ──────────────────────────────────────────────────────────
  const importanceAccent = msg.importance === 'urgent' ? 'var(--danger)' : msg.importance === 'important' ? '#C47B2A' : null;
  const importanceBg = msg.importance === 'urgent' ? 'rgba(168,51,42,0.07)' : msg.importance === 'important' ? 'rgba(196,123,42,0.06)' : undefined;

  return (
    <>
    <div
      data-msg-id={msg.id}
      className={`group relative transition-colors ${isContinuation ? 'py-1' : 'py-2.5'}`}
      style={{
        borderBottom: isGroupEnd ? '1px solid var(--rule-2)' : 'none',
        borderLeft: importanceAccent ? `3px solid ${importanceAccent}` : '3px solid transparent',
        paddingLeft: 21,
        paddingRight: 24,
        background: importanceBg,
      }}
    >
      {/* ── Floating action bar — hidden while inline form or delete confirm is open ── */}
      {!showInlineForm && !showDeleteConfirm && (
        <div className="absolute right-4 top-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 z-10">
          <MessageActionBar
            msg={msg}
            onReply={onReply}
            onShare={onShare}
            onTask={!msg.linked_task && !quickCreatedTask && !inlineCreated
              ? () => { void handleQuickCreateTask(); }
              : undefined}
            onAlert={!msg.is_system ? () => setShowAlertModal(true) : undefined}
            onEdit={isOwn && !msg.is_system ? handleEdit : undefined}
            onDelete={isOwn && !msg.is_system ? handleDelete : undefined}
            isOwn={isOwn}
            onReactionToggle={onReactionToggle}
            reactions={effectiveReactions}
            onReactionsChange={handleReactionsChange}
            onToggleReady={fn => { toggleRef.current = fn; }}
          />
        </div>
      )}

      <div className="flex gap-3 items-start">
        {/* Avatar column — 22px wide for consistent text alignment across groups */}
        {isContinuation ? (
          <div style={{ width: 22, flexShrink: 0 }} />
        ) : (() => {
          const senderMember = members.find(m => m.id === msg.sender?.id);
          return (
            <button
              onClick={() => msg.sender && openSidebar({ type: 'user-profile', userId: msg.sender.id })}
              style={{ background: 'none', border: 'none', padding: 0, cursor: msg.sender ? 'pointer' : 'default', marginTop: 3, flexShrink: 0 }}
            >
              <UserAvatar
                src={msg.sender?.avatar_url}
                name={msg.sender?.name}
                size={22}
                statusEmoji={senderMember?.status_emoji}
                statusText={senderMember?.status_text}
              />
            </button>
          );
        })()}

        <div className="flex-1 min-w-0">
          {/* Header row — omitted for continuation messages */}
          {!isContinuation && (
            <div className="flex items-baseline gap-2.5 mb-1">
              <span
                style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', cursor: msg.sender ? 'pointer' : 'default' }}
                onClick={() => msg.sender && openSidebar({ type: 'user-profile', userId: msg.sender.id })}
                onMouseEnter={e => { if (msg.sender) e.currentTarget.style.textDecoration = 'underline'; }}
                onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
              >
                {msg.sender?.name || 'Former Member'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--faint)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
                {format(new Date(msg.created_at), 'HH:mm')}
              </span>
              {depth === 1 && (
                <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)' }}>reply</span>
              )}
              {importanceAccent && (
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--paper)', background: importanceAccent,
                  padding: '2px 7px', marginLeft: 4, flexShrink: 0,
                }}>
                  {msg.importance}
                </span>
              )}
            </div>
          )}

          {/* Reply-to context */}
          {replyTo && (
            <div className="mb-2 cursor-pointer" onClick={() => onReply?.(replyTo)}
              style={{ borderLeft: '2px solid var(--rule)', paddingLeft: 10 }}
              onMouseEnter={e => (e.currentTarget.style.borderLeftColor = 'var(--ink)')}
              onMouseLeave={e => (e.currentTarget.style.borderLeftColor = 'var(--rule)')}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{replyTo.sender?.name}</span>
              <p style={{ fontSize: 13, color: 'var(--faint)', marginTop: 1 }}>
                {replyTo.content.slice(0, 80)}{replyTo.content.length > 80 ? '…' : ''}
              </p>
            </div>
          )}

          {/* Shared message preview */}
          {msg.shared_message && (
            <div role="button" tabIndex={0} onClick={handleGoToSource}
              onKeyDown={e => e.key === 'Enter' && handleGoToSource()}
              className="mb-2 cursor-pointer"
              style={{ borderLeft: '2px solid var(--rule)', paddingLeft: 10, maxWidth: '56ch' }}
              onMouseEnter={e => (e.currentTarget.style.borderLeftColor = 'var(--ink)')}
              onMouseLeave={e => (e.currentTarget.style.borderLeftColor = 'var(--rule)')}>
              <div className="flex items-baseline gap-2 mb-0.5">
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{msg.shared_message.sender_name}</span>
                {msg.shared_message.channel_name && (
                  <span style={{ fontSize: 11, color: 'var(--faint)' }}>#{msg.shared_message.channel_name}</span>
                )}
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }} className="line-clamp-3 whitespace-pre-wrap">
                {msg.shared_message.content || <span style={{ fontStyle: 'italic', color: 'var(--faint)' }}>No content</span>}
              </p>
            </div>
          )}

          {/* Importance pill for continuation messages (header row is hidden) */}
          {isContinuation && importanceAccent && (
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--paper)', background: importanceAccent,
              padding: '2px 7px', display: 'inline-block', marginBottom: 4,
            }}>
              {msg.importance}
            </span>
          )}

          {/* Message text — or inline edit form */}
          {editing ? (
            <div className="mt-0.5">
              <textarea
                autoFocus
                style={{ width: '100%', maxWidth: '64ch', fontSize: 15, lineHeight: 1.55, color: 'var(--ink)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--ink)', outline: 'none', resize: 'none', minHeight: 56, maxHeight: 200, fontFamily: 'inherit', letterSpacing: '-0.005em', padding: '2px 0' }}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(); }
                  if (e.key === 'Escape') setEditing(false);
                }}
              />
              <div className="flex items-baseline gap-5 mt-2">
                <button onClick={handleEditSave} disabled={editSaving || !editContent.trim()} className="btn-primary">
                  {editSaving ? 'Saving…' : 'Save →'}
                </button>
                <button onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
                <span style={{ fontSize: 11, color: 'var(--faint)', marginLeft: 'auto', letterSpacing: '0.04em' }}>↵ save · Esc cancel</span>
              </div>
            </div>
          ) : (msg.content || !msg.shared_message) && (
            <p
              style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: '64ch', letterSpacing: '-0.005em', whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: onReply ? 'pointer' : undefined }}
              onClick={onReply ? e => { if (!(e.target as HTMLElement).closest('a')) onReply(msg); } : undefined}
            >
              {renderedContent}
              {msg.edited_at && (
                <span
                  className="ml-1.5 select-none"
                  style={{ fontSize: 11, color: 'var(--faint)', fontStyle: 'italic' }}
                  title={`Edited ${formatDistanceToNow(new Date(msg.edited_at), { addSuffix: true })}`}
                >
                  edited
                </span>
              )}
            </p>
          )}

          {/* Smart suggestion banner */}
          {showAiBanner && aiType && (
            <SmartSuggestionBanner
              type={aiType}
              onConvert={() => { setSuggestionDismissed(msg.id); setAiDismissed(true); void handleQuickCreateTask(); }}
              onDismiss={() => { setSuggestionDismissed(msg.id); setAiDismissed(true); }}
            />
          )}

          {/* Inline task form */}
          {showInlineForm && (
            <InlineTaskForm
              msg={msg}
              prefill={buildSmartTitle(msg.content)}
              defaultDueDate={extractDueDate(msg.content)}
              onClose={() => setShowInlineForm(false)}
              onSuccess={handleInlineSuccess}
            />
          )}

          {/* Task-linked block — left-border pattern, same as reply-to and shared-message */}
          {(() => {
            const linkedTask = msg.linked_task ?? quickCreatedTask;
            if (!linkedTask && !inlineCreated) return null;
            return (
              <div
                className="mt-2"
                style={{ borderLeft: '2px solid var(--rule)', paddingLeft: 10, cursor: linkedTask ? 'pointer' : 'default' }}
                onClick={() => { if (!linkedTask) return; setSelectedTask(linkedTask); }}
                onMouseEnter={e => { if (linkedTask) e.currentTarget.style.borderLeftColor = 'var(--ink)'; }}
                onMouseLeave={e => (e.currentTarget.style.borderLeftColor = 'var(--rule)')}
              >
                <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 3 }}>
                  Task created
                </div>
                {linkedTask ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', letterSpacing: '-0.005em', lineHeight: 1.4 }}>
                      {linkedTask.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
                      {linkedTask.task_key} · open →
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>Task added to board</div>
                )}
              </div>
            );
          })()}

          {/* Inline delete confirmation */}
          {showDeleteConfirm && (
            <div className="flex items-baseline gap-5 mt-2 pt-2 animate-fade-in" style={{ borderTop: '1px solid var(--rule)', fontSize: 13, color: 'var(--muted)' }}>
              <span>Delete this message?</span>
              <button onClick={handleDeleteConfirm} disabled={deleteInFlight} className="btn-danger">
                {deleteInFlight ? '…' : 'Delete'}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleteInFlight} className="btn-ghost">
                Cancel
              </button>
            </div>
          )}

          {/* Reactions — plain emoji count */}
          {effectiveReactions.length > 0 && (
            <div className="flex flex-wrap gap-4 mt-2">
              {effectiveReactions.map(r => {
                const isMine = r.users.includes(user?.id ?? '');
                return (
                  <button key={r.emoji} type="button" onClick={() => toggleRef.current(r.emoji)}
                    className="flex items-baseline gap-1 select-none"
                    style={{ fontSize: 13, color: isMine ? 'var(--ink)' : 'var(--muted)', fontWeight: isMine ? 500 : 400 }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                    onMouseLeave={e => (e.currentTarget.style.color = isMine ? 'var(--ink)' : 'var(--muted)')}>
                    <span>{r.emoji}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Thread chip */}
          {depth === 0 && !inThread && msg.reply_count ? (
            <div className="mt-1.5">
              {onReply && (
                <button onClick={() => onReply(msg)}
                  className="flex items-baseline gap-2"
                  style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '0.02em' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                  <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>
                    {msg.reply_count} {msg.reply_count === 1 ? 'reply' : 'replies'}
                  </strong>
                  {threadUnread[msg.id] > 0 && <span style={{ color: 'var(--ink)', fontWeight: 500 }}>· {threadUnread[msg.id]} new</span>}
                  <span style={{ color: 'var(--faint)' }}>→</span>
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>

    {showAlertModal && (
      <SendPriorityAlertModal
        onClose={() => setShowAlertModal(false)}
        initialMessage={msg.content.slice(0, 300)}
        initialRecipientIds={extractMentionedIds(msg.content, members).filter(id => id !== user?.id)}
      />
    )}
    </>
  );
}

export default memo(MessageBubble, (prev, next) =>
  prev.msg.id        === next.msg.id        &&
  prev.msg.content   === next.msg.content   &&
  prev.msg.edited_at === next.msg.edited_at &&
  prev.msg.reactions === next.msg.reactions &&
  prev.msg.linked_task === next.msg.linked_task &&
  prev.isContinuation === next.isContinuation &&
  prev.isGroupEnd    === next.isGroupEnd    &&
  prev.depth         === next.depth         &&
  prev.inThread      === next.inThread      &&
  prev.replyTo       === next.replyTo
);
