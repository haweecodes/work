import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format, addDays } from 'date-fns';
import useAuthStore from '../store/authStore';
import useUIStore from '../store/uiStore';
import useBoardStore from '../store/boardStore';
import useWorkspaceStore from '../store/workspaceStore';
import MessageActionBar from './MessageActionBar';
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
  onOpenFull,
}: {
  msg: Message;
  prefill: string;
  defaultDueDate?: string | null;
  onClose: () => void;
  onSuccess: (task: Task) => void;
  onOpenFull: (data: InlineTaskPrefill) => void;
}) {
  const { boards, columns, fetchColumns } = useBoardStore();
  const [title, setTitle] = useState(prefill.slice(0, 120));
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState(defaultDueDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeBoard = boards[0];
  const todoColumn = columns.find(c => /to.?do|todo|backlog/i.test(c.title)) ?? columns[0];

  const handleSubmit = async () => {
    if (!title.trim()) return;
    if (!activeBoard) { onOpenFull({ title, priority, dueDate }); return; }
    if (!todoColumn) {
      await fetchColumns(activeBoard.id);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await client.post<Task>('/api/tasks', {
        board_id: activeBoard.id,
        column_id: todoColumn.id,
        title: title.trim(),
        priority,
        due_date: dueDate || undefined,
        linked_message_id: msg.id,
      });
      onSuccess(data);
    } catch {
      setError('Failed to create task. Try again.');
      setSaving(false);
    }
  };

  return (
    <div
      className="mt-2 rounded-xl border p-3 animate-fade-in"
      onClick={e => e.stopPropagation()}
      style={{
        borderColor: '#7C3AED',
        borderWidth: 1.5,
        background: '#FFFFFF',
        boxShadow: '0 0 0 4px rgba(124,58,237,0.08)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-3 text-[12px] font-semibold" style={{ color: '#7C3AED' }}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.5 2h-11A1.5 1.5 0 001 3.5v9A1.5 1.5 0 002.5 14h11a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0013.5 2zM6.5 11.5l-3-3 1.06-1.06 1.94 1.94 4.44-4.44 1.06 1.06-5.5 5.5z"/>
        </svg>
        Create Task from Message
      </div>

      {/* Title — full width */}
      <div className="mb-2">
        <label className="block text-[10.5px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>
          Task Title
        </label>
        <input
          autoFocus
          className="w-full rounded-md px-2.5 py-1.5 text-[13px] text-gray-900 border outline-none transition-colors"
          style={{ background: '#F8F9FC', borderColor: '#E5E7EB', fontFamily: 'DM Sans, sans-serif' }}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          onFocus={e => (e.currentTarget.style.borderColor = '#7C3AED')}
          onBlur={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
        />
      </div>

      {/* Priority + Due date row */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-[10.5px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>
            Priority
          </label>
          <select
            className="w-full rounded-md px-2.5 py-1.5 text-[13px] border outline-none"
            style={{ background: '#F8F9FC', borderColor: '#E5E7EB', color: '#111827', fontFamily: 'DM Sans, sans-serif' }}
            value={priority}
            onChange={e => setPriority(e.target.value)}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="block text-[10.5px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>
            Due Date
          </label>
          <input
            type="date"
            className="w-full rounded-md px-2.5 py-1.5 text-[13px] border outline-none"
            style={{ background: '#F8F9FC', borderColor: '#E5E7EB', color: '#111827', fontFamily: 'DM Sans, sans-serif' }}
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </div>
      </div>

      {/* Board info */}
      {activeBoard && (
        <div className="flex items-center gap-1.5 mb-3 text-[11.5px]" style={{ color: '#9CA3AF' }}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 1h3v14H2V1zm4.5 2h3v12h-3V3zM11 5h3v10h-3V5z"/>
          </svg>
          Board: <span className="font-medium text-gray-600">{activeBoard.name}</span>
          {todoColumn && <> · Column: <span className="font-medium text-gray-600">{todoColumn.title}</span></>}
        </div>
      )}

      {error && <p className="text-[11.5px] text-red-500 mb-2">{error}</p>}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onOpenFull({ title, priority, dueDate })}
          className="text-[12px] font-medium transition-colors"
          style={{ color: '#7C3AED' }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
        >
          More options →
        </button>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-[13px] border transition-colors"
            style={{ color: '#6B7280', borderColor: '#E5E7EB', background: 'transparent', fontFamily: 'DM Sans, sans-serif' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F3F4F6')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
            className="px-3 py-1.5 rounded-md text-[13px] font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: '#7C3AED', fontFamily: 'DM Sans, sans-serif' }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {saving ? 'Saving…' : 'Add to Board →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface MessageBubbleProps {
  msg: Message;
  onCreateTask: (msg: Message, prefill?: InlineTaskPrefill) => void;
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
}

export default function MessageBubble({
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
}: MessageBubbleProps) {
  const user = useAuthStore(s => s.user);
  const { threadUnread, setActiveThreadId } = useUIStore();
  const navigate = useNavigate();
  const { boards, columns, fetchColumns, selectedTask, setSelectedTask, updateTaskInColumn } = useBoardStore();
  const { members } = useWorkspaceStore();

  const [reactions, setReactions] = useState<Reaction[]>(msg.reactions ?? []);
  const [aiDismissed, setAiDismissed] = useState(() => getSuggestionDismissed(msg.id));
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [inlineCreated, setInlineCreated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const [editSaving, setEditSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
      updateTaskInColumn(data); // add to KanbanPanel without joining the board socket room
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

  const renderContent = (content: string) => {
    const parts = content.split(/(\*\*[^*]+\*\*|@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
      }
      if (/^@\w+/.test(part)) {
        return <span key={i} className="text-primary-600 font-medium bg-primary-50 px-0.5 rounded">{part}</span>;
      }
      return part;
    });
  };

  const handleGoToSource = () => {
    const sm = msg.shared_message;
    if (!sm) return;
    if (sm.channel_id) {
      navigate(`/channel/${sm.channel_id}`);
      if (sm.parent_message_id) setTimeout(() => setActiveThreadId(sm.parent_message_id!), 300);
    } else if (sm.dm_thread_id) {
      navigate(`/dm/${sm.dm_thread_id}`);
      if (sm.parent_message_id) setTimeout(() => setActiveThreadId(sm.parent_message_id!), 300);
    }
  };

  // ── System message ──────────────────────────────────────────────────────────
  if (msg.is_system === 1) {
    const isTaskLink = !!msg.linked_task;
    return (
      <div data-msg-id={msg.id} className="flex gap-3 px-6 py-2 hover:bg-gray-50/50 transition-colors">
        <img src={msg.sender?.avatar_url} className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5 opacity-80" alt={msg.sender?.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-700">{msg.sender?.name || 'System'}</span>
            <span className="text-xs text-gray-400">{formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium tracking-wide shadow-sm border border-gray-200/50">system</span>
          </div>
          <div
            onClick={() => {
              if (isTaskLink && msg.linked_task && selectedTask?.id !== msg.linked_task.id) setSelectedTask(msg.linked_task);
            }}
            className={`mt-1 inline-block border border-gray-100 rounded-lg px-3.5 py-2.5 text-sm text-gray-600 bg-gray-50
              ${isTaskLink ? 'cursor-pointer hover:bg-white hover:border-primary-200 hover:shadow-sm transition-all group/sysbox' : ''}`}
          >
            <span>{renderContent((() => {
              if (msg.content.startsWith('{')) {
                try {
                  const p = JSON.parse(msg.content);
                  if (p.type === 'task_assigned') {
                    if (msg.channel_id) return `${p.actorName} assigned a task to **${p.assigneeName}**: **${p.taskTitle}**`;
                    if (p.actorId === user?.id) return `You assigned a task: **${p.taskTitle}**`;
                    return `Assigned you to a task: **${p.taskTitle}**`;
                  }
                  if (p.type === 'task_unassigned') {
                    if (msg.channel_id) return `${p.actorName} removed **${p.assigneeName}** from a task: **${p.taskTitle}**`;
                    if (p.actorId === user?.id) return `You removed them from a task: **${p.taskTitle}**`;
                    return `Removed you from a task: **${p.taskTitle}**`;
                  }
                } catch(e) {}
              }
              return msg.content;
            })())}</span>
            {isTaskLink && (
              <div className="mt-2 flex items-center gap-1.5 text-primary-600 font-semibold text-[11px] border-t border-gray-200/60 pt-2 opacity-80 group-hover/sysbox:opacity-100 group-hover/sysbox:text-primary-700 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
                View task: <span className="font-medium">{msg.linked_task?.task_key ? `${msg.linked_task.task_key} ` : ''}{msg.linked_task?.title}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Deleted message placeholder ─────────────────────────────────────────────
  if (msg.deleted) {
    return (
      <div
        data-msg-id={msg.id}
        className="flex gap-3 px-6 py-1.5"
      >
        <div className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5 bg-gray-100" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-400">{msg.sender?.name || 'Member'}</span>
            <span className="text-xs text-gray-300">
              {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
            </span>
          </div>
          <p
            className="text-sm italic flex items-center gap-1.5"
            style={{ color: '#9CA3AF' }}
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            This message was deleted.
          </p>
        </div>
      </div>
    );
  }

  // ── Normal message ──────────────────────────────────────────────────────────
  return (
    <div
      data-msg-id={msg.id}
      className={`group relative px-6 hover:bg-gray-50/80 transition-colors ${isContinuation ? 'py-0.5' : 'py-1.5'}`}
    >
      {/* ── Floating action bar — hidden while inline form or delete confirm is open ── */}
      {!showInlineForm && !showDeleteConfirm && (
        <div className="absolute right-4 top-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
          <MessageActionBar
            msg={msg}
            onReply={onReply}
            onShare={onShare}
            onTask={!msg.linked_task && !quickCreatedTask && !inlineCreated
              ? () => { void handleQuickCreateTask(); }
              : undefined}
            onEdit={isOwn && !msg.is_system ? handleEdit : undefined}
            onDelete={isOwn && !msg.is_system ? handleDelete : undefined}
            isOwn={isOwn}
            compact={inThread}
            onReactionToggle={onReactionToggle}
            reactions={effectiveReactions}
            onReactionsChange={handleReactionsChange}
            onToggleReady={fn => { toggleRef.current = fn; }}
          />
        </div>
      )}

      <div className="flex gap-3 items-start">
        {isContinuation ? (
          /* Time hint shown on hover in the avatar slot */
          <div className="w-8 flex-shrink-0 flex items-center justify-center" style={{ height: 20 }}>
            <span className="text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity select-none"
              style={{ color: '#C4C9D4' }}>
              {format(new Date(msg.created_at), 'HH:mm')}
            </span>
          </div>
        ) : (
          <img
            src={msg.sender?.avatar_url}
            className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5"
            alt={msg.sender?.name}
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Header row — omitted for continuation messages */}
          {!isContinuation && (
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-900">{msg.sender?.name || 'Former Member'}</span>
            <span className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
            </span>
            {depth === 1 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-500 font-medium">reply</span>
            )}
          </div>
          )}

          {/* Reply-to context card */}
          {replyTo && (
            <div
              className="mb-1.5 flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors max-w-xs"
              onClick={() => onReply?.(replyTo)}
              title="Jump to this reply"
            >
              <svg className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-gray-500">{replyTo.sender?.name}</span>
                <p className="text-xs text-gray-400 truncate leading-snug mt-0.5">
                  {replyTo.content.slice(0, 80)}{replyTo.content.length > 80 ? '…' : ''}
                </p>
              </div>
            </div>
          )}

          {/* Shared message preview */}
          {msg.shared_message && (
            <div
              role="button"
              tabIndex={0}
              onClick={handleGoToSource}
              onKeyDown={e => e.key === 'Enter' && handleGoToSource()}
              className="mb-2 rounded-lg border-l-4 border-primary-300 bg-primary-50/60 px-3 py-2 max-w-sm cursor-pointer hover:bg-primary-100/70 transition-colors group/shared"
              title="Click to view original message"
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                {msg.shared_message.sender_avatar && (
                  <img src={msg.shared_message.sender_avatar} className="w-4 h-4 rounded-full" alt="" />
                )}
                <span className="text-xs font-semibold text-primary-700">{msg.shared_message.sender_name}</span>
                {msg.shared_message.channel_name && (
                  <span className="text-xs text-primary-400">in #{msg.shared_message.channel_name}</span>
                )}
                <span className="text-xs text-primary-300">
                  {formatDistanceToNow(new Date(msg.shared_message.created_at), { addSuffix: true })}
                </span>
                <svg className="w-3 h-3 text-primary-400 ml-auto opacity-0 group-hover/shared:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
              <p className="text-xs text-primary-800 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                {msg.shared_message.content || <span className="italic text-primary-400">No content</span>}
              </p>
            </div>
          )}

          {/* Message text — or inline edit form */}
          {editing ? (
            <div className="mt-0.5">
              <textarea
                autoFocus
                className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 resize-none outline-none transition-colors"
                style={{ borderColor: '#7C3AED', background: '#FAFAFA', minHeight: 60, maxHeight: 200, fontFamily: 'inherit' }}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(); }
                  if (e.key === 'Escape') setEditing(false);
                }}
              />
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[11px] text-gray-400">Enter to save · Esc to cancel</span>
                <div className="flex gap-1.5 ml-auto">
                  <button onClick={() => setEditing(false)}
                    className="px-2.5 py-1 rounded text-[12px] border text-gray-500 hover:bg-gray-50 transition-colors"
                    style={{ borderColor: '#E5E7EB' }}>
                    Cancel
                  </button>
                  <button onClick={handleEditSave} disabled={editSaving || !editContent.trim()}
                    className="px-2.5 py-1 rounded text-[12px] font-medium text-white transition-opacity disabled:opacity-50"
                    style={{ background: '#7C3AED' }}>
                    {editSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ) : (msg.content || !msg.shared_message) && (
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
              {renderContent(msg.content)}
              {msg.edited_at && (
                <span
                  className="ml-1.5 text-[11px] select-none"
                  style={{ color: '#9CA3AF' }}
                  title={`Edited ${formatDistanceToNow(new Date(msg.edited_at), { addSuffix: true })}`}
                >
                  (edited)
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
              onOpenFull={(data) => { setShowInlineForm(false); onCreateTask(msg, data); }}
            />
          )}

          {/* Task-linked pill — shows after task was created; click to open detail */}
          {(() => {
            const linkedTask = msg.linked_task ?? quickCreatedTask;
            if (!linkedTask && !inlineCreated) return null;
            return (
              <button
                type="button"
                onClick={() => {
                  if (!linkedTask) return;
                  setSelectedTask(linkedTask);
                  setActiveThreadId(null); // close thread so task detail takes the right-panel slot
                }}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 mt-1.5 text-[11.5px] font-semibold border transition-all"
                style={{ background: '#F0FDFA', borderColor: '#99F6E4', color: '#0D9488', cursor: linkedTask ? 'pointer' : 'default' }}
                onMouseEnter={e => { if (linkedTask) { e.currentTarget.style.background = '#CCFBF1'; e.currentTarget.style.borderColor = '#2DD4BF'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F0FDFA'; e.currentTarget.style.borderColor = '#99F6E4'; }}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.5 2h-11A1.5 1.5 0 001 3.5v9A1.5 1.5 0 002.5 14h11a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0013.5 2zM6.5 11.5l-3-3 1.06-1.06 1.94 1.94 4.44-4.44 1.06 1.06-5.5 5.5z"/>
                </svg>
                Task created
                {linkedTask?.task_key && <span className="font-bold">· {linkedTask.task_key}</span>}
                {linkedTask && <span style={{ opacity: 0.7 }}>· Edit →</span>}
              </button>
            );
          })()}

          {/* Inline delete confirmation — stacked layout works at any panel width */}
          {showDeleteConfirm && (
            <div
              className="mt-2 rounded-xl border animate-fade-in overflow-hidden"
              style={{ borderColor: '#FECACA', background: '#FEF2F2' }}
            >
              <div className="px-3.5 pt-2.5 pb-2">
                {/* Text row */}
                <div className="flex items-center gap-2 mb-2.5">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#DC2626" strokeWidth={2} className="flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <p className="text-[13px] font-semibold leading-snug" style={{ color: '#991B1B' }}>
                    Delete this message?
                  </p>
                </div>
                <p className="text-[12px] mb-2.5 ml-5" style={{ color: '#B91C1C' }}>
                  This can't be undone.
                </p>
                {/* Button row — always right-aligned */}
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleteInFlight}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors disabled:opacity-50"
                    style={{ color: '#6B7280', borderColor: '#E5E7EB', background: 'transparent', fontFamily: 'DM Sans, sans-serif' }}
                    onMouseEnter={e => { if (!deleteInFlight) e.currentTarget.style.background = '#F3F4F6'; }}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteConfirm}
                    disabled={deleteInFlight}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white transition-opacity disabled:opacity-60"
                    style={{ background: '#DC2626', fontFamily: 'DM Sans, sans-serif' }}
                    onMouseEnter={e => { if (!deleteInFlight) e.currentTarget.style.opacity = '0.88'; }}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    {deleteInFlight ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Reaction pills */}
          {effectiveReactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {effectiveReactions.map(r => (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => toggleRef.current(r.emoji)}
                  className={[
                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all border select-none',
                    r.users.includes(user?.id ?? '')
                      ? 'bg-primary-50 border-primary-200 text-primary-700 hover:bg-primary-100'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100',
                  ].join(' ')}
                >
                  <span className="text-sm leading-none">{r.emoji}</span>
                  <span>{r.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Thread reply count */}
          {depth === 0 && !inThread && msg.reply_count ? (
            <div className="mt-1.5 flex items-center gap-2">
              {onReply && (
                <button
                  onClick={() => onReply(msg)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-50 text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors border border-gray-100 hover:border-primary-100"
                >
                  <img src={msg.sender?.avatar_url} className="w-4 h-4 rounded-full border border-white" alt="" />
                  {msg.reply_count} {msg.reply_count === 1 ? 'reply' : 'replies'}
                </button>
              )}
              {threadUnread[msg.id] > 0 && <span className="flex h-2 w-2 rounded-full bg-red-500" />}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
