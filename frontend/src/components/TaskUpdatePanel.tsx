import { useState, useEffect, useContext } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-react';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import SocketContext from '../context/SocketContext';

interface TimelineRow {
  request_id: string;
  board_id: string;
  board_name: string;
  scope: string;
  requester_name: string;
  requested_at: string;
  task_id: string;
  task_title: string;
  task_key: string;
  due_date: string | null;
  column_title: string;
  response_status: string | null;
  response_reason: string | null;
  responded_at: string | null;
}

interface TaskRow {
  task_id: string;
  task_title: string;
  task_key: string;
  column_title: string;
  due_date: string | null;
  response_status: string | null;
  response_reason: string | null;
  responded_at: string | null;
}

interface RequestGroup {
  request_id: string;
  board_id: string;
  board_name: string;
  requester_name: string;
  requested_at: string;
  pending: TaskRow[];
  responded: TaskRow[];
}

function groupRows(rows: TimelineRow[]): RequestGroup[] {
  const map = new Map<string, RequestGroup>();
  for (const row of rows) {
    if (!map.has(row.request_id)) {
      map.set(row.request_id, {
        request_id: row.request_id,
        board_id: row.board_id,
        board_name: row.board_name,
        requester_name: row.requester_name,
        requested_at: row.requested_at,
        pending: [],
        responded: [],
      });
    }
    const group = map.get(row.request_id)!;
    const task: TaskRow = {
      task_id: row.task_id,
      task_title: row.task_title,
      task_key: row.task_key,
      column_title: row.column_title,
      due_date: row.due_date,
      response_status: row.response_status,
      response_reason: row.response_reason,
      responded_at: row.responded_at,
    };
    if (row.response_status === null) {
      group.pending.push(task);
    } else {
      group.responded.push(task);
    }
  }
  return Array.from(map.values());
}

interface TaskCardProps {
  task: TaskRow;
  requestId: string;
  onResponded: (requestId: string, taskId: string, status: string, reason: string | null) => void;
}

function PendingTaskCard({ task, requestId, onResponded }: TaskCardProps) {
  const taskUpdateStatuses = useWorkspaceStore(s => s.taskUpdateStatuses);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const requiresReason = taskUpdateStatuses.find(s => s.value === pendingStatus)?.requiresReason ?? false;

  const submit = async (status: string, submitReason?: string) => {
    setSubmitting(true);
    setError('');
    try {
      await client.post(`/api/task-updates/${requestId}/respond`, {
        task_id: task.task_id,
        status,
        reason: submitReason || undefined,
      });
      onResponded(requestId, task.task_id, status, submitReason ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to send');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusClick = (status: string, needsReason: boolean) => {
    if (needsReason) {
      setPendingStatus(status);
    } else {
      submit(status);
    }
  };

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--rule-2)' }}>
      <div className="flex items-baseline gap-2 mb-1">
        <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--primary)', letterSpacing: '0.04em', flexShrink: 0 }}>
          {task.task_key}
        </span>
        <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.task_title}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-2" style={{ fontSize: 11, color: 'var(--muted)' }}>
        <span>{task.column_title}</span>
        {task.due_date && (
          <>
            <span style={{ color: 'var(--rule)' }}>·</span>
            <span>Due {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </>
        )}
      </div>

      {error && <p style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>{error}</p>}

      {pendingStatus !== null ? (
        <div className="flex flex-col gap-1.5">
          <input
            autoFocus
            style={{ fontSize: 12, border: '1px solid var(--rule)', padding: '4px 8px', fontFamily: 'inherit', width: '100%', outline: 'none', borderRadius: 2 }}
            placeholder="Add a reason… (optional)"
            value={reason}
            onChange={e => setReason(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submit(pendingStatus, reason); }
              if (e.key === 'Escape') { setPendingStatus(null); setReason(''); }
            }}
          />
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={submitting} onClick={() => submit(pendingStatus, reason)}>
              {submitting ? 'Sending…' : 'Send →'}
            </button>
            <button className="btn-ghost" onClick={() => { setPendingStatus(null); setReason(''); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          {taskUpdateStatuses.map(s => (
            <button
              key={s.value}
              disabled={submitting}
              style={{
                fontSize: 11, fontWeight: 500, color: s.color,
                border: `1px solid ${s.color}`, padding: '2px 9px',
                fontFamily: 'inherit', opacity: submitting ? 0.5 : 1,
              }}
              onClick={() => handleStatusClick(s.value, !!s.requiresReason)}>
              {submitting ? '…' : s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  onClose: () => void;
}

export default function TaskUpdatePanel({ onClose }: Props) {
  const [groups, setGroups] = useState<RequestGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const socketRef = useContext(SocketContext);

  const fetchTimeline = () => {
    setLoading(true);
    client.get<TimelineRow[]>('/api/task-updates/pending/me')
      .then(({ data }) => setGroups(groupRows(data)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTimeline(); }, []);

  // Real-time: when someone responds, update local state
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;
    const onResponded = ({ request_id, response }: { request_id: string; response: any }) => {
      setGroups(prev => prev.map(g => {
        if (g.request_id !== request_id) return g;
        const task = g.pending.find(t => t.task_id === response.task_id);
        if (!task) return g;
        return {
          ...g,
          pending: g.pending.filter(t => t.task_id !== response.task_id),
          responded: [...g.responded, { ...task, response_status: response.status, response_reason: response.reason ?? null, responded_at: response.created_at }],
        };
      }));
    };
    const onRequested = () => fetchTimeline();
    socket.on('task_update_responded', onResponded);
    socket.on('task_update_requested', onRequested);
    return () => { socket.off('task_update_responded', onResponded); socket.off('task_update_requested', onRequested); };
  }, [socketRef]);

  const handleResponded = (requestId: string, taskId: string, status: string, reason: string | null) => {
    setGroups(prev => prev.map(g => {
      if (g.request_id !== requestId) return g;
      const task = g.pending.find(t => t.task_id === taskId);
      if (!task) return g;
      return {
        ...g,
        pending: g.pending.filter(t => t.task_id !== taskId),
        responded: [...g.responded, { ...task, response_status: status, response_reason: reason, responded_at: new Date().toISOString() }],
      };
    }));
  };

  const toggleHistory = (requestId: string) => {
    setExpandedHistory(prev => {
      const next = new Set(prev);
      if (next.has(requestId)) next.delete(requestId); else next.add(requestId);
      return next;
    });
  };

  const taskUpdateStatuses = useWorkspaceStore(s => s.taskUpdateStatuses);
  const statusColor = Object.fromEntries(taskUpdateStatuses.map(s => [s.value, s.color]));
  const statusLabel = Object.fromEntries(taskUpdateStatuses.map(s => [s.value, s.label]));

  const totalPending = groups.reduce((n, g) => n + g.pending.length, 0);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--paper)', borderLeft: '1px solid var(--rule)' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0" style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--rule)' }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)' }}>
            Update Requests
          </span>
          {totalPending > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: 'var(--paper)', background: 'var(--primary)',
              minWidth: 18, height: 18, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', padding: '0 5px',
            }}>
              {totalPending}
            </span>
          )}
        </div>
        <button onClick={onClose}
          style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--faint)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
          Close
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {loading ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>Loading…</p>
          </div>
        ) : groups.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--faint)', fontStyle: 'italic' }}>You're all caught up</p>
          </div>
        ) : groups.map(group => {
          const historyOpen = expandedHistory.has(group.request_id);
          return (
            <div key={group.request_id} style={{ borderBottom: '1px solid var(--rule)', padding: '16px 24px' }}>
              {/* Group header */}
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 500 }}>
                  <strong style={{ fontWeight: 600 }}>{group.requester_name}</strong>
                  <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {group.board_name}</span>
                </p>
                <span style={{ fontSize: 11, color: 'var(--faint)', flexShrink: 0 }}>
                  {formatDistanceToNow(new Date(group.requested_at), { addSuffix: true })}
                </span>
              </div>
              {group.pending.length > 0 && (
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                  {group.pending.length} task{group.pending.length > 1 ? 's' : ''} awaiting your response
                </p>
              )}

              {/* Pending tasks */}
              {group.pending.map(task => (
                <PendingTaskCard
                  key={task.task_id}
                  task={task}
                  requestId={group.request_id}
                  onResponded={handleResponded}
                />
              ))}

              {/* Responded tasks (collapsible) */}
              {group.responded.length > 0 && (
                <div style={{ marginTop: group.pending.length > 0 ? 12 : 0 }}>
                  <button
                    className="flex items-center gap-1"
                    style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                    onClick={() => toggleHistory(group.request_id)}>
                    {historyOpen
                      ? <ChevronDown size={12} />
                      : <ChevronRight size={12} />}
                    Already responded ({group.responded.length})
                  </button>
                  {historyOpen && (
                    <div className="flex flex-col gap-1.5 mt-2">
                      {group.responded.map(task => (
                        <div key={task.task_id}
                          className="flex items-start justify-between gap-3"
                          style={{ borderLeft: `2px solid ${statusColor[task.response_status!] ?? 'var(--rule)'}`, paddingLeft: 8 }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--muted)', flexShrink: 0 }}>
                                {task.task_key}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {task.task_title}
                              </span>
                            </div>
                            {task.response_reason && (
                              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, fontStyle: 'italic' }}>
                                {task.response_reason}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                            <span style={{ fontSize: 11, fontWeight: 500, color: statusColor[task.response_status!] ?? 'var(--muted)' }}>
                              {statusLabel[task.response_status!] ?? task.response_status}
                            </span>
                            {task.responded_at && (
                              <span style={{ fontSize: 10, color: 'var(--faint)' }}>
                                {formatDistanceToNow(new Date(task.responded_at), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {group.pending.length === 0 && group.responded.length > 0 && (
                <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 8, fontStyle: 'italic' }}>
                  All done for this request
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
