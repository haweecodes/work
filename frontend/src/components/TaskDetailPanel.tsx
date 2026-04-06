import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';
import useBoardStore from '../store/boardStore';
import useUIStore from '../store/uiStore';
import type { TaskAssignee } from '../types';

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

export default function TaskDetailPanel() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setActiveThreadId = useUIStore(s => s.setActiveThreadId);
  const user = useAuthStore(s => s.user);
  const { members } = useWorkspaceStore();
  const { selectedTask, setSelectedTask, columns, updateTaskInColumn, removeTask } = useBoardStore();
  const [form, setForm] = useState<{
    title: string;
    description: string;
    priority: string;
    due_date: string;
    column_id: string;
    assignee_ids: string[];
    parent_task_id: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Inline Subtask State
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [creatingSubtask, setCreatingSubtask] = useState(false);

  const [copiedKey, setCopiedKey] = useState(false);

  // Re-fetch the full task (with joined message data) whenever the selected task changes.
  // The task objects in the store may be partial (opened from a message chip), so we always
  // pull fresh data from the dedicated endpoint before rendering the form.
  useEffect(() => {
    if (!selectedTask) return;
    setLoading(true);
    setForm(null); // clear stale form while loading
    // reset copied state on task change
    setCopiedKey(false);
    client.get(`/api/tasks/task/${selectedTask.id}`)
      .then(({ data }) => {
        const merged = { ...selectedTask, ...data };
        setSelectedTask(merged);
        setForm({
          title: merged.title,
          description: merged.description || '',
          priority: merged.priority || 'medium',
          due_date: merged.due_date || '',
          column_id: merged.column_id,
          assignee_ids: merged.assignees?.map((a: any) => a.id) || [],
          parent_task_id: merged.parent_task_id || '',
        });
      })
      .catch(() => {
        // Fallback: use whatever data we have
        setForm({
          title: selectedTask.title,
          description: selectedTask.description || '',
          priority: selectedTask.priority || 'medium',
          due_date: selectedTask.due_date || '',
          column_id: selectedTask.column_id || '',
          assignee_ids: selectedTask.assignees?.map(a => a.id) || [],
          parent_task_id: selectedTask.parent_task_id || '',
        });
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTask?.id]);

  const handleSave = async () => {
    if (!form || !selectedTask) return;
    setSaving(true);
    try {
      const { data } = await client.patch(`/api/tasks/${selectedTask.id}`, form);
      const assignees: TaskAssignee[] = members
        .filter(m => form.assignee_ids.includes(m.id))
        .map(m => ({ id: m.id, name: m.name, avatar_url: m.avatar_url }));
      const updatedTask = { ...data, assignees };
      updateTaskInColumn(updatedTask);
      setSelectedTask(updatedTask);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTask || !confirm('Delete this task?')) return;
    setDeleting(true);
    try {
      await client.delete(`/api/tasks/${selectedTask.id}`);
      removeTask(selectedTask.id);
      setSelectedTask(null);
    } finally {
      setDeleting(false);
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


  const ps = PRIORITY_STYLES[form.priority] || PRIORITY_STYLES.medium;
  const allTasks = columns.flatMap(c => c.tasks);
  const subtasks = allTasks.filter(t => t.parent_task_id === selectedTask.id);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2 relative">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Task Details</span>
          {selectedTask.task_key && (
            <>
              <span className="text-gray-300">•</span>
              <button 
                onClick={handleCopyKey}
                title="Copy task ID"
                className="text-xs font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded uppercase tracking-wider hover:bg-primary-100 transition-colors flex items-center gap-1 group/copy"
              >
                {selectedTask.task_key}
                {copiedKey ? (
                  <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </>
          )}
        </div>
        <button onClick={() => {
            setSelectedTask(null);
            setSearchParams({}, { replace: true });
          }}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div>
          <input className="w-full text-base font-semibold text-gray-900 border-0 outline-none bg-transparent
            focus:ring-0 px-0 placeholder-gray-300 resize-none"
            value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="Task title..." />
        </div>

        <div>
          <label className="label">Priority</label>
          <div className="flex gap-2">
            {Object.entries(PRIORITY_STYLES).map(([key, val]) => (
              <button key={key} type="button"
                onClick={() => setForm({ ...form, priority: key })}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${form.priority === key ? val.badge : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${val.dot}`} />
                {val.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Status</label>
          <select className="input" value={form.column_id} onChange={e => setForm({ ...form, column_id: e.target.value })}>
            {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Due date</label>
            <input className="input" type="date" value={form.due_date}
              onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div>
            <label className="label">Parent Task</label>
            <select className="input" value={form.parent_task_id} onChange={e => setForm({ ...form, parent_task_id: e.target.value })}>
              <option value="">None</option>
              {allTasks.filter(t => t.id !== selectedTask.id).map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Assignees</label>
          <div className="flex flex-wrap gap-2">
            {members.map(m => (
              <button key={m.id} type="button"
                onClick={() => toggleAssignee(m.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${form.assignee_ids.includes(m.id) ? 'bg-primary-100 border-primary-300 text-primary-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                <img src={m.avatar_url} className="w-4 h-4 rounded-full" />
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea className="input resize-none leading-relaxed" rows={5}
            placeholder="Add a description..." value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>

        <div>
          <label className="label">Subtasks</label>
          <div className="space-y-2 mt-1">
            {subtasks.map(st => (
              <div key={st.id} onClick={() => setSelectedTask(st)} className="p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer hover:border-primary-300 transition-colors flex items-center justify-between group">
                <div className="flex gap-2 items-center">
                  <div className={`w-2 h-2 rounded-full ${PRIORITY_STYLES[st.priority || 'medium']?.dot}`} />
                  <p className="text-sm font-medium text-gray-900 group-hover:text-primary-700">{st.title}</p>
                </div>
                <span className="text-xs font-semibold text-gray-400 bg-white px-2 py-0.5 border border-gray-100 rounded-md">
                  {columns.find(c => c.id === st.column_id)?.title}
                </span>
              </div>
            ))}
            
            <form onSubmit={handleCreateSubtask} className="flex gap-2 mt-2">
              <input 
                type="text" 
                className="input flex-1 border-dashed bg-gray-50/50 hover:bg-gray-50 focus:bg-white transition-colors"
                placeholder="+ Add new subtask..."
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                disabled={creatingSubtask}
              />
              <button 
                type="submit" 
                disabled={!newSubtaskTitle.trim() || creatingSubtask}
                className="btn-primary whitespace-nowrap px-3 text-xs"
              >
                {creatingSubtask ? '...' : 'Add'}
              </button>
            </form>
          </div>
        </div>

        {selectedTask.linked_message_id && (
          <div>
            <label className="label">Linked message</label>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-600">
              <p className="text-xs text-gray-400 mb-2">Created from a channel message</p>
              <div className="flex items-center gap-3">
                <p className="italic flex-1 break-words line-clamp-1">"{selectedTask.description?.slice(0, 50)}..."</p>
                {selectedTask.linked_message_id && (
                  <button 
                    onClick={() => {
                      // Open the thread panel on the correct parent message
                      if (selectedTask.linked_parent_message_id) {
                        setActiveThreadId(selectedTask.linked_parent_message_id);
                      } else if (selectedTask.linked_message_id) {
                        setActiveThreadId(selectedTask.linked_message_id);
                      }

                      // Navigate to the channel/DM with the message highlighted
                      const highlightId = selectedTask.linked_message_id;
                      if (selectedTask.linked_channel_id) {
                        navigate(`/channel/${selectedTask.linked_channel_id}?highlight=${highlightId}`);
                      } else if (selectedTask.linked_dm_thread_id) {
                        navigate(`/dm/${selectedTask.linked_dm_thread_id}?highlight=${highlightId}`);
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

      <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
        <button onClick={handleDelete} className="btn-ghost text-red-500 hover:text-red-600 hover:bg-red-50" disabled={deleting}>
          {deleting ? '...' : 'Delete'}
        </button>
        <button onClick={handleSave} className="btn-primary flex-1 justify-center" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
