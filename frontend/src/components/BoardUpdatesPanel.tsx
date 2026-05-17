import { useState, useEffect, useContext } from 'react';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';
import useBoardStore from '../store/boardStore';
import SocketContext from '../context/SocketContext';
import type { Column, Task, TaskUpdateRequest } from '../types';

const STATUS_LABEL: Record<string, string> = {
  on_track:  'On Track',
  delayed:   'Delayed',
  finished:  'Finished',
  cancelled: 'Cancelled',
  pending:   'Pending…',
};
const STATUS_COLOR: Record<string, string> = {
  on_track:  'var(--ink)',
  delayed:   '#C47B2A',
  finished:  'var(--ink)',
  cancelled: 'var(--faint)',
  pending:   'var(--faint)',
};

const SCOPE_LABEL: Record<string, string> = {
  board:  'Whole board',
  column: 'Column',
  task:   'Task',
};

interface Props {
  boardId: string;
  onClose: () => void;
  canRequest: boolean;
}

export default function BoardUpdatesPanel({ boardId, onClose, canRequest }: Props) {
  const user = useAuthStore(s => s.user);
  const { currentWorkspace } = useWorkspaceStore();
  const { columns } = useBoardStore();
  const socketRef = useContext(SocketContext);

  const [requests, setRequests] = useState<TaskUpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Request form state
  const [scope, setScope] = useState<'board' | 'column' | 'task'>('board');
  const [selectedColumn, setSelectedColumn] = useState(columns[0]?.id ?? '');
  const [selectedTask, setSelectedTask] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const allTasks: Task[] = columns.flatMap(c => c.tasks ?? []);

  useEffect(() => {
    setLoading(true);
    client.get<TaskUpdateRequest[]>(`/api/task-updates/${boardId}`)
      .then(({ data }) => setRequests(data))
      .finally(() => setLoading(false));
  }, [boardId]);

  // Live socket updates
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;
    const onRequested = (req: TaskUpdateRequest) => setRequests(prev => [req, ...prev]);
    const onResponded = ({ request_id, response }: { request_id: string; response: any }) => {
      setRequests(prev => prev.map(r => {
        if (r.id !== request_id) return r;
        const without = r.responses.filter(x => !(x.task_id === response.task_id && x.user_id === response.user_id));
        return { ...r, responses: [...without, response] };
      }));
    };
    socket.on('task_update_requested', onRequested);
    socket.on('task_update_responded', onResponded);
    return () => { socket.off('task_update_requested', onRequested); socket.off('task_update_responded', onResponded); };
  }, [socketRef]);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendError('');
    try {
      await client.post('/api/task-updates/request', {
        board_id: boardId,
        scope,
        column_id: scope === 'column' ? selectedColumn : undefined,
        task_id:   scope === 'task'   ? selectedTask   : undefined,
      });
      // The socket event will prepend the new request to the list
    } catch (err: any) {
      setSendError(err.response?.data?.error ?? 'Failed to send request');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--paper)', borderLeft: '1px solid var(--rule)' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0" style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--rule)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)' }}>
          Request Updates
        </span>
        <button onClick={onClose}
          style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--faint)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
          Close
        </button>
      </div>

      {/* Request form — only for admins / board creator */}
      {canRequest && (
        <form onSubmit={handleRequest} className="flex-shrink-0" style={{ padding: '16px 24px', borderBottom: '1px solid var(--rule)' }}>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>
            Ask for update
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="input"
              style={{ fontSize: 12, flex: '0 0 auto' }}
              value={scope}
              onChange={e => setScope(e.target.value as any)}>
              <option value="board">Whole board</option>
              <option value="column">A column</option>
              <option value="task">A task</option>
            </select>

            {scope === 'column' && (
              <select className="input" style={{ fontSize: 12, flex: 1, minWidth: 0 }}
                value={selectedColumn} onChange={e => setSelectedColumn(e.target.value)}>
                {columns.map((c: Column) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            )}

            {scope === 'task' && (
              <select className="input" style={{ fontSize: 12, flex: 1, minWidth: 0 }}
                value={selectedTask} onChange={e => setSelectedTask(e.target.value)}>
                <option value="">Select task…</option>
                {allTasks.map(t => <option key={t.id} value={t.id}>{t.task_key} — {t.title}</option>)}
              </select>
            )}

            <button type="submit" className="btn-primary" disabled={sending || (scope === 'task' && !selectedTask)}>
              {sending ? 'Sending…' : 'Send →'}
            </button>
          </div>
          {sendError && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{sendError}</p>}
        </form>
      )}

      {/* History */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {loading ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>Loading…</p>
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>No update requests yet</p>
          </div>
        ) : requests.map(req => (
          <div key={req.id} style={{ padding: '16px 24px', borderBottom: '1px solid var(--rule-2)' }}>
            {/* Request header */}
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>
                {SCOPE_LABEL[req.scope]}
              </span>
              <span style={{ fontSize: 11, color: 'var(--faint)', flexShrink: 0 }}>
                {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
              Requested by <strong style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{req.requester_name}</strong>
            </p>

            {/* Responses */}
            <div className="flex flex-col gap-1.5">
              {req.responses.map((resp, i) => (
                <div key={`${resp.task_id}-${resp.user_id}-${i}`}
                  className="flex items-baseline justify-between gap-3"
                  style={{ borderLeft: `2px solid ${STATUS_COLOR[resp.status] ?? 'var(--rule)'}`, paddingLeft: 8 }}>
                  <div className="flex-1 min-w-0">
                    <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--muted)', marginRight: 6 }}>
                      {resp.task_key}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{resp.user_name}</span>
                    {resp.reason && (
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, fontStyle: 'italic' }}>
                        {resp.reason}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, color: STATUS_COLOR[resp.status], flexShrink: 0 }}>
                    {resp.status === 'finished' ? '✓ ' : ''}{STATUS_LABEL[resp.status]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
