import { useState } from 'react';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import useBoardStore from '../store/boardStore';
import type { Message, Task } from '../types';

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'];

interface CreateTaskModalProps {
  onClose: (task: Task | null) => void;
  prefilledMessage?: Message | null;
  boardId: string;
  createInColumn?: string;
}

export default function CreateTaskModal({ onClose, prefilledMessage, boardId, createInColumn }: CreateTaskModalProps) {
  const { members } = useWorkspaceStore();
  const { columns, addTaskToColumn } = useBoardStore();
  const allColumns = columns;

  const [form, setForm] = useState({
    title: prefilledMessage ? prefilledMessage.content.slice(0, 80) : '',
    description: prefilledMessage ? prefilledMessage.content : '',
    column_id: createInColumn || allColumns[0]?.id || '',
    priority: 'medium',
    due_date: '',
    assignee_ids: [] as string[],
    parent_task_id: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleAssignee = (id: string) => {
    setForm(f => ({
      ...f,
      assignee_ids: f.assignee_ids.includes(id)
        ? f.assignee_ids.filter(a => a !== id)
        : [...f.assignee_ids, id]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.column_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await client.post<Task>('/api/tasks', {
        ...form,
        board_id: boardId,
        linked_message_id: prefilledMessage?.id || null,
      });
      addTaskToColumn(data);
      onClose(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => onClose(null)}>
      <div className="bg-white rounded-2xl shadow-panel w-full max-w-lg animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            {prefilledMessage ? 'Create task from message' : 'New task'}
          </h2>
          <button onClick={() => onClose(null)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {prefilledMessage && (
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-xs text-gray-400 mb-1">From message by <strong>{prefilledMessage.sender?.name}</strong></p>
              <p className="text-sm text-gray-700 line-clamp-2">{prefilledMessage.content}</p>
            </div>
          )}

          <div>
            <label className="label">Title <span className="text-red-400">*</span></label>
            <input className="input" placeholder="Task title..." value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })} required autoFocus />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea className="input resize-none" rows={3} placeholder="Add details..."
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Column</label>
              <select className="input" value={form.column_id} onChange={e => setForm({ ...form, column_id: e.target.value })}>
                {allColumns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                {PRIORITY_OPTIONS.map(p => <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Due date</label>
              <input className="input" type="date" value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Parent Task (optional)</label>
              <select className="input" value={form.parent_task_id} onChange={e => setForm({ ...form, parent_task_id: e.target.value })}>
                <option value="">None</option>
                {columns.flatMap(c => c.tasks).map(t => (
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
                    ${form.assignee_ids.includes(m.id) ? 'bg-primary-100 border-primary-300 text-primary-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  <img src={m.avatar_url} className="w-4 h-4 rounded-full" />
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={() => onClose(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
