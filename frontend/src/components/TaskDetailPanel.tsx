import { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, Flag, Layers, Calendar, Users, AlignLeft, ListTree, GitBranch, MessageSquare } from 'lucide-react';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import useBoardStore from '../store/boardStore';
import type { Column, TaskAssignee } from '../types';

interface PriorityStyle {
  badge: string;
  dot: string;
  label: string;
}

const PRIORITY_STYLES: Record<string, PriorityStyle> = {
  low:      { badge: 'badge-priority-low',      dot: 'bg-emerald-400', label: 'Low' },
  medium:   { badge: 'badge-priority-medium',   dot: 'bg-amber-400',   label: 'Medium' },
  high:     { badge: 'badge-priority-high',      dot: 'bg-orange-500',  label: 'High' },
  critical: { badge: 'badge-priority-critical',  dot: 'bg-red-500',     label: 'Critical' },
};

export default function TaskDetailPanel({ onBack }: { onBack?: () => void } = {}) {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const { members } = useWorkspaceStore();
  const { boards, selectedTask, setSelectedTask, columns, updateTaskInColumn, removeTask } = useBoardStore();
  const [form, setForm] = useState<{
    title: string;
    description: string;
    priority: string;
    due_date: string;
    column_id: string;
    board_id: string;
    assignee_ids: string[];
    parent_task_id: string;
  } | null>(null);
  const [boardColumns, setBoardColumns] = useState<Column[]>(columns);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Inline Subtask State
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [creatingSubtask, setCreatingSubtask] = useState(false);

  const [copiedKey, setCopiedKey] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Column matching state when moving to a different board
  const [columnMatchState, setColumnMatchState] = useState<'matched' | 'unmatched' | null>(null);

  // Pending update request for this task
  const [pendingRequest, setPendingRequest] = useState<{ request_id: string; notification_id: string; requester_name: string } | null>(null);
  const [respondingStatus, setRespondingStatus] = useState<string | null>(null);
  const [delayReason, setDelayReason] = useState('');
  const [submittingResponse, setSubmittingResponse] = useState(false);

  // Fetch the full enriched task whenever the selected task ID changes.
  // We populate the form from fresh API data but do NOT write back to the store
  // (setSelectedTask inside the effect would re-trigger BoardView's URL-sync
  // effect and cause an infinite fetch loop).
  useEffect(() => {
    if (!selectedTask) return;
    setLoading(true);
    setForm(null);
    setCopiedKey(false);
    setColumnMatchState(null);
    client.get(`/api/tasks/task/${selectedTask.id}`)
      .then(({ data }) => {
        setForm({
          title: data.title,
          description: data.description || '',
          priority: data.priority || 'medium',
          due_date: data.due_date ? data.due_date.slice(0, 10) : '',
          column_id: data.column_id || selectedTask.column_id,
          board_id: data.board_id || selectedTask.board_id || '',
          assignee_ids: data.assignees?.map((a: any) => a.id) || [],
          parent_task_id: data.parent_task_id || '',
        });
        setBoardColumns(columns);
      })
      .catch(() => {
        setForm({
          title: selectedTask.title,
          description: selectedTask.description || '',
          priority: selectedTask.priority || 'medium',
          due_date: selectedTask.due_date || '',
          column_id: selectedTask.column_id || '',
          board_id: selectedTask.board_id || '',
          assignee_ids: selectedTask.assignees?.map(a => a.id) || [],
          parent_task_id: selectedTask.parent_task_id || '',
        });
        setBoardColumns(columns);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTask?.id]);

  // Check for pending update requests for this task
  useEffect(() => {
    if (!selectedTask) { setPendingRequest(null); return; }
    setPendingRequest(null);
    setRespondingStatus(null);
    setDelayReason('');
    client.get<any[]>('/api/task-updates/pending/me')
      .then(({ data }) => {
        const match = data.find((r: any) => r.task_id === selectedTask.id);
        if (match) setPendingRequest({ request_id: match.request_id, notification_id: match.notification_id, requester_name: match.requester_name });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTask?.id]);


  // Fetch columns when board changes in the form
  useEffect(() => {
    if (!form?.board_id) return;
    if (form.board_id === selectedTask?.board_id) {
      setBoardColumns(columns);
      setColumnMatchState(null);
      return;
    }
    setLoadingColumns(true);
    // Capture current column title before fetching new board's columns
    const currentColTitle = (columns.find(c => c.id === form.column_id)?.title ?? selectedTask?.column_title ?? '').toLowerCase();
    client.get<Column[]>(`/api/boards/${form.board_id}/columns`)
      .then(({ data }) => {
        setBoardColumns(data);
        const match = currentColTitle ? data.find(c => c.title.toLowerCase() === currentColTitle) : null;
        if (match) {
          setForm(f => f ? { ...f, column_id: match.id } : null);
          setColumnMatchState('matched');
        } else {
          setForm(f => f ? { ...f, column_id: '' } : null);
          setColumnMatchState('unmatched');
        }
      })
      .finally(() => setLoadingColumns(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.board_id]);

  const handleSave = async () => {
    if (!form || !selectedTask) return;
    setSaving(true);
    setSaveStatus('idle');
    const boardChanged = form.board_id && form.board_id !== selectedTask.board_id;
    try {
      const { data } = await client.patch(`/api/tasks/${selectedTask.id}`, form);
      const assignees: TaskAssignee[] = members
        .filter(m => form.assignee_ids.includes(m.id))
        .map(m => ({ id: m.id, name: m.name, avatar_url: m.avatar_url }));
      const updatedTask = { ...data, assignees };
      if (boardChanged) {
        // Task is no longer on the current board's view — remove it
        removeTask(selectedTask.id);
      } else {
        updateTaskInColumn(updatedTask);
        setSelectedTask(updatedTask);
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTask) return;
    setDeleting(true);
    try {
      await client.delete(`/api/tasks/${selectedTask.id}`);
      removeTask(selectedTask.id);
      setSelectedTask(null);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleCreateSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || !selectedTask) return;
    setCreatingSubtask(true);
    try {
      const { data } = await client.post('/api/tasks', {
        title: newSubtaskTitle.trim(),
        board_id: selectedTask.board_id,
        column_id: selectedTask.column_id, // Default to same column
        parent_task_id: selectedTask.id
      });
      // Add the new task directly to the boardStore columns
      updateTaskInColumn(data);
      setNewSubtaskTitle('');
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingSubtask(false);
    }
  };

  const toggleAssignee = (id: string) => {
    setForm(f => f ? ({
      ...f,
      assignee_ids: f.assignee_ids.includes(id)
        ? f.assignee_ids.filter(a => a !== id)
        : [...f.assignee_ids, id]
    }) : null);
  };

  // Auto-focus title when form finishes loading
  useEffect(() => {
    if (form) {
      const t = setTimeout(() => titleRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [!!form]); // eslint-disable-line react-hooks/exhaustive-deps

  const closePanel = useCallback(() => {
    if (onBack) onBack();
    else { setSelectedTask(null); setSearchParams({}, { replace: true }); }
  }, [onBack, setSelectedTask, setSearchParams]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave(); }
  }, [closePanel, handleSave]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopyKey = () => {
    if (selectedTask?.task_key) {
      navigator.clipboard.writeText(window.location.origin + '/t/' + selectedTask.task_key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  if (!selectedTask) return null;
  if (loading || !form) return (
    <div className="h-full flex flex-col animate-pulse p-5 space-y-4">
      <div className="h-5 bg-gray-200 rounded w-3/4" />
      <div className="h-3 bg-gray-100 rounded w-1/2" />
      <div className="h-3 bg-gray-100 rounded w-2/3" />
      <div className="h-20 bg-gray-100 rounded" />
      <div className="h-8 bg-gray-100 rounded" />
    </div>
  );


  const allTasks = columns.flatMap(c => c.tasks);
  const subtasks = allTasks.filter(t => t.parent_task_id === selectedTask.id);
  const doneColumnId = [...columns].sort((a, b) => (b.position ?? 0) - (a.position ?? 0))[0]?.id;
  const completedSubtasksCount = subtasks.filter(t => t.column_id === doneColumnId).length;

  return (
    <div className="h-full flex flex-col" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex items-center gap-3 flex-shrink-0" style={{ padding: '18px 28px 16px', borderBottom: '1px solid var(--rule)' }}>
        {onBack && (
          <button onClick={onBack} style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
            ← Back
          </button>
        )}
        <div className="flex items-baseline gap-2 flex-1 min-w-0">
          <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 500 }}>
            Task
          </span>
          {selectedTask.task_key && (
            <button onClick={handleCopyKey} title="Copy task key"
              style={{ fontSize: 11, color: copiedKey ? 'var(--ink)' : 'var(--muted)', letterSpacing: '0.1em', fontVariantNumeric: 'tabular-nums' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={e => { if (!copiedKey) e.currentTarget.style.color = 'var(--muted)'; }}>
              {copiedKey ? `${selectedTask.task_key} ✓` : selectedTask.task_key}
            </button>
          )}
        </div>
        <button
          onClick={() => { setSelectedTask(null); setSearchParams({}, { replace: true }); }}
          style={{ fontSize: 12, color: 'var(--faint)', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
          Close
        </button>
      </div>

      {/* Update request response bar */}
      {pendingRequest && (
        <div className="flex-shrink-0" style={{ padding: '12px 28px', background: '#F0F7FF', borderBottom: '1px solid #C7DEFF' }}>
          <p style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>
            <strong style={{ fontWeight: 500 }}>{pendingRequest.requester_name}</strong> is asking for an update on this task
          </p>
          {respondingStatus === 'delayed' ? (
            <div className="flex flex-col gap-2">
              <textarea
                autoFocus
                rows={2}
                style={{ fontSize: 13, width: '100%', border: '1px solid var(--rule)', borderRadius: 4, padding: '6px 8px', fontFamily: 'inherit', resize: 'none', outline: 'none' }}
                placeholder="What's causing the delay? (optional)"
                value={delayReason}
                onChange={e => setDelayReason(e.target.value)}
              />
              <div className="flex items-baseline gap-4">
                <button
                  className="btn-primary"
                  disabled={submittingResponse}
                  onClick={async () => {
                    setSubmittingResponse(true);
                    try {
                      await client.post(`/api/task-updates/${pendingRequest.request_id}/respond`, {
                        task_id: selectedTask!.id, status: 'delayed', reason: delayReason || undefined,
                      });
                      setPendingRequest(null);
                    } finally { setSubmittingResponse(false); }
                  }}>
                  {submittingResponse ? 'Sending…' : 'Send →'}
                </button>
                <button className="btn-ghost" onClick={() => setRespondingStatus(null)}>Back</button>
              </div>
            </div>
          ) : (
            <div className="flex items-baseline gap-3 flex-wrap">
              {(['on_track', 'delayed', 'finished', 'cancelled'] as const).map(s => {
                const labels: Record<string, string> = { on_track: 'On Track', delayed: 'Delayed…', finished: 'Finished', cancelled: 'Cancelled' };
                const colors: Record<string, string> = { on_track: 'var(--ink)', delayed: '#C47B2A', finished: 'var(--ink)', cancelled: 'var(--faint)' };
                return (
                  <button
                    key={s}
                    disabled={submittingResponse}
                    style={{ fontSize: 12, fontWeight: 500, color: colors[s], letterSpacing: '0.04em', border: `1px solid ${colors[s]}`, padding: '3px 10px' }}
                    onClick={async () => {
                      if (s === 'delayed') { setRespondingStatus('delayed'); return; }
                      setSubmittingResponse(true);
                      try {
                        await client.post(`/api/task-updates/${pendingRequest.request_id}/respond`, {
                          task_id: selectedTask!.id, status: s,
                        });
                        setPendingRequest(null);
                      } finally { setSubmittingResponse(false); }
                    }}>
                    {labels[s]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-6" style={{ padding: '24px 28px' }}>
        {/* Title */}
        <div>
          <input
            ref={titleRef}
            style={{ fontSize: 18, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.01em', width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', outline: 'none', padding: '2px 0', fontFamily: 'inherit' }}
            onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--ink)')}
            onBlur={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
            onMouseEnter={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderBottomColor = 'var(--rule)'; }}
            onMouseLeave={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderBottomColor = 'transparent'; }}
            value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="Task title"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="label flex items-center gap-1.5"><Flag size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />Priority</label>
          <div className="flex gap-5">
            {Object.entries(PRIORITY_STYLES).map(([key]) => (
              <button key={key} type="button"
                onClick={() => setForm({ ...form, priority: key })}
                style={{
                  fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: form.priority === key ? 'var(--ink)' : 'var(--faint)',
                  fontWeight: form.priority === key ? 500 : 400,
                  textDecoration: form.priority === key ? 'underline' : 'none',
                  textUnderlineOffset: 3,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                onMouseLeave={e => { if (form.priority !== key) e.currentTarget.style.color = 'var(--faint)'; }}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Board */}
        <div>
          <label className="label flex items-center gap-1.5"><LayoutDashboard size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />Board</label>
          <select className="input" value={form.board_id}
            disabled={!!selectedTask.parent_task_id}
            onChange={e => setForm({ ...form, board_id: e.target.value, column_id: '' })}>
            {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {selectedTask.parent_task_id && (
            <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>
              Subtasks stay on their parent's board
            </p>
          )}
          {subtasks.length > 0 && form.board_id !== selectedTask.board_id && (
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {subtasks.length} subtask{subtasks.length !== 1 ? 's' : ''} will also move to this board
            </p>
          )}
        </div>

        {/* Status */}
        <div>
          <label className="label flex items-center gap-1.5"><Layers size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />Status</label>
          <select className="input" value={form.column_id}
            onChange={e => setForm({ ...form, column_id: e.target.value })}
            disabled={loadingColumns}>
            {loadingColumns
              ? <option>Loading…</option>
              : <>
                  {columnMatchState === 'unmatched' && <option value="">— pick a column —</option>}
                  {boardColumns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </>
            }
          </select>
          {columnMatchState === 'matched' && (
            <p style={{ fontSize: 11, color: 'var(--ink)', marginTop: 4 }}>
              ✓ Matched to "{boardColumns.find(c => c.id === form.column_id)?.title}"
            </p>
          )}
          {columnMatchState === 'unmatched' && (
            <p style={{ fontSize: 11, color: '#C47B2A', marginTop: 4 }}>
              Current status doesn't exist in this board — select a column to continue
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="label flex items-center gap-1.5"><Calendar size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />Due date</label>
            <input className="input" type="date" value={form.due_date}
              onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div>
            <label className="label flex items-center gap-1.5"><GitBranch size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />Parent Task</label>
            <select className="input" value={form.parent_task_id} onChange={e => setForm({ ...form, parent_task_id: e.target.value })}>
              <option value="">None</option>
              {allTasks.filter(t => t.id !== selectedTask.id).map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            {form.parent_task_id && (() => {
              const parent = allTasks.find(t => t.id === form.parent_task_id);
              return parent ? (
                <button
                  type="button"
                  onClick={() => setSelectedTask(parent)}
                  style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'block' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.textDecoration = 'underline'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.textDecoration = 'none'; }}
                >
                  → {parent.title}
                </button>
              ) : null;
            })()}
          </div>
        </div>

        <div>
          <label className="label flex items-center gap-1.5"><Users size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />Assignees</label>
          <div className="flex flex-wrap gap-2">
            {members.map(m => (
              <button key={m.id} type="button"
                onClick={() => toggleAssignee(m.id)}
                style={{
                  fontSize: 13, color: form.assignee_ids.includes(m.id) ? 'var(--ink)' : 'var(--muted)',
                  fontWeight: form.assignee_ids.includes(m.id) ? 500 : 400,
                  borderBottom: `1px solid ${form.assignee_ids.includes(m.id) ? 'var(--ink)' : 'transparent'}`,
                  paddingBottom: 1,
                }}
                className="flex items-center gap-1.5"
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                onMouseLeave={e => { if (!form.assignee_ids.includes(m.id)) e.currentTarget.style.color = 'var(--muted)'; }}
              >
                <img src={m.avatar_url} className="w-4 h-4 rounded-full" />
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label flex items-center gap-1.5"><AlignLeft size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />Description</label>
          <textarea className="input resize-none leading-relaxed" rows={5}
            placeholder="Add a description..." value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label className="label flex items-center gap-1.5"><ListTree size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />Subtasks</label>
            {subtasks.length > 0 && (
              <span style={{
                fontSize: 11,
                color: completedSubtasksCount === subtasks.length ? 'var(--success, #059669)' : 'var(--muted)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {completedSubtasksCount}/{subtasks.length} complete
              </span>
            )}
          </div>
          <div className="space-y-0 mt-1">
            {subtasks.map(st => {
              const isDone = st.column_id === doneColumnId;
              return (
                <div key={st.id} onClick={() => setSelectedTask(st)}
                  className="flex items-baseline justify-between py-2 cursor-pointer"
                  style={{ borderBottom: '1px solid var(--rule-2)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <p style={{ fontSize: 14, letterSpacing: '-0.005em', color: isDone ? 'var(--faint)' : 'var(--ink)', textDecoration: isDone ? 'line-through' : 'none' }}>{st.title}</p>
                  <span style={{ fontSize: 11, color: isDone ? '#059669' : 'var(--faint)', letterSpacing: '0.04em', textTransform: 'uppercase', marginLeft: 12, fontWeight: isDone ? 500 : 400 }}>
                    {isDone ? '✓ ' : ''}{columns.find(c => c.id === st.column_id)?.title}
                  </span>
                </div>
              );
            })}
            <form onSubmit={handleCreateSubtask} className="flex items-baseline gap-4 pt-2">
              <input
                type="text"
                className="input flex-1"
                placeholder="New subtask…"
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                disabled={creatingSubtask}
              />
              <button type="submit" disabled={!newSubtaskTitle.trim() || creatingSubtask} className="btn-primary">
                {creatingSubtask ? '…' : 'Add →'}
              </button>
            </form>
          </div>
        </div>

        {selectedTask.linked_message_id && (
          <div>
            <label className="label flex items-center gap-1.5"><MessageSquare size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />Linked message</label>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-600">
              <p className="text-xs text-gray-400 mb-2">Created from a channel message</p>
              <div className="flex items-center gap-3">
                <p className="italic flex-1 break-words line-clamp-1">"{selectedTask.description?.slice(0, 50)}..."</p>
                {selectedTask.linked_message_id && (
                  <button
                    onClick={() => {
                      const highlightId = selectedTask.linked_message_id;
                      const threadId = selectedTask.linked_parent_message_id || selectedTask.linked_message_id;
                      const threadParam = threadId ? `&threadId=${threadId}` : '';
                      if (selectedTask.linked_channel_id) {
                        navigate(`/channel/${selectedTask.linked_channel_id}?highlight=${highlightId}${threadParam}`);
                      } else if (selectedTask.linked_dm_thread_id) {
                        navigate(`/dm/${selectedTask.linked_dm_thread_id}?highlight=${highlightId}${threadParam}`);
                      }
                    }}
                    className="flex-shrink-0 text-xs font-semibold text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2.5 py-1.5 rounded-lg border border-primary-100 transition-colors flex items-center gap-1.5"
                  >
                    Go to message
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Created {selectedTask.created_at ? format(new Date(selectedTask.created_at), 'MMM d, yyyy') : ''}
          </p>
        </div>
      </div>

      <div className="flex items-baseline gap-6 flex-shrink-0" style={{ padding: '16px 28px 20px', borderTop: '1px solid var(--rule)' }}>
        {showDeleteConfirm ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Delete this task?</span>
            <button onClick={handleDelete} disabled={deleting} className="btn-danger"
              style={{ color: 'var(--danger)' }}>
              {deleting ? '…' : 'Confirm'}
            </button>
            <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="btn-ghost">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button onClick={handleSave} className="btn-primary"
              disabled={saving || (form.board_id !== selectedTask.board_id && !form.column_id)}
              title={form.board_id !== selectedTask.board_id && !form.column_id ? 'Select a column in the target board first' : 'Save (⌘↵)'}
              style={saveStatus === 'saved' ? { color: 'var(--ink)', textDecorationColor: 'var(--ink)' } : saveStatus === 'error' ? { color: 'var(--danger)' } : {}}>
              {saving ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Save failed — retry' : 'Save changes →'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-danger"
              disabled={subtasks.length > 0}
              title={subtasks.length > 0 ? `Cannot delete — has ${subtasks.length} subtask${subtasks.length > 1 ? 's' : ''}` : undefined}>
              Delete
            </button>
            {subtasks.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--faint)' }}>
                Delete subtasks first
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
