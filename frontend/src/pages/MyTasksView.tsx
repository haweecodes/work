import { useState, useEffect } from 'react';
import { format, isToday, isTomorrow, isPast, isFuture } from 'date-fns';
import client from '../api/client';
import useBoardStore from '../store/boardStore';
import type { Task } from '../types';

interface MyTask extends Task {
  board_name?: string;
  column_title?: string;
}

type Filter = 'all' | 'overdue' | 'today' | 'upcoming' | 'no_due_date';

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#f59e0b',
  low:      '#10b981',
};

export default function MyTasksView() {
  const setSelectedTask = useBoardStore(s => s.setSelectedTask);
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    setLoading(true);
    client.get<MyTask[]>('/api/tasks?scope=mine')
      .then(({ data }) => setTasks(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = tasks.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'no_due_date') return !t.due_date;
    if (!t.due_date) return false;
    const due = new Date(t.due_date);
    if (filter === 'overdue')  return isPast(due) && !isToday(due);
    if (filter === 'today')    return isToday(due);
    if (filter === 'upcoming') return isFuture(due) && !isToday(due);
    return true;
  });

  const filterCounts: Record<Filter, number> = {
    all:         tasks.length,
    overdue:     tasks.filter(t => t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date))).length,
    today:       tasks.filter(t => t.due_date && isToday(new Date(t.due_date))).length,
    upcoming:    tasks.filter(t => t.due_date && isFuture(new Date(t.due_date)) && !isToday(new Date(t.due_date))).length,
    no_due_date: tasks.filter(t => !t.due_date).length,
  };

  function dueBadge(t: MyTask) {
    if (!t.due_date) return null;
    const due = new Date(t.due_date);
    if (isPast(due) && !isToday(due)) return <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>Overdue</span>;
    if (isToday(due)) return <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>Today</span>;
    if (isTomorrow(due)) return <span style={{ fontSize: 11, color: '#2563eb' }}>Tomorrow</span>;
    return <span style={{ fontSize: 11, color: 'var(--muted)' }}>{format(due, 'MMM d')}</span>;
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--surface)' }}>
      {/* Header */}
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid var(--rule)', background: 'var(--paper)' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: 12 }}>
          My Tasks
        </h1>
        <div className="flex items-center gap-1 flex-wrap">
          {(['all', 'overdue', 'today', 'upcoming', 'no_due_date'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontSize: 12, padding: '4px 12px', letterSpacing: '0.03em',
                color: filter === f ? 'var(--ink)' : 'var(--muted)',
                fontWeight: filter === f ? 600 : 400,
                borderBottom: `2px solid ${filter === f ? 'var(--ink)' : 'transparent'}`,
                background: 'transparent',
              }}
            >
              {f === 'no_due_date' ? 'No due date' : f.charAt(0).toUpperCase() + f.slice(1)}
              {filterCounts[f] > 0 && (
                <span style={{ marginLeft: 5, fontSize: 10, color: f === 'overdue' ? '#dc2626' : 'var(--faint)' }}>
                  {filterCounts[f]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '0 32px' }}>
        {loading ? (
          <div className="space-y-3 pt-6">
            {[1,2,3,4].map(i => (
              <div key={i} className="animate-pulse h-10 bg-gray-100 rounded" style={{ opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--faint)' }}>
            <p style={{ fontSize: 15 }}>No tasks</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>
              {filter === 'all' ? 'You have no tasks assigned to you yet.' : `No tasks match the "${filter}" filter.`}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                {['Key', 'Title', 'Board', 'Status', 'Priority', 'Due'].map(h => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTask(t)}
                  style={{ borderBottom: '1px solid var(--rule-2)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 8px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: 11 }}>
                    {t.task_key ?? '—'}
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--ink)', fontWeight: 400, maxWidth: 300 }}>
                    <span className="line-clamp-1">{t.title}</span>
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {(t as any).board_name ?? '—'}
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {t.column_title ?? '—'}
                  </td>
                  <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                    {t.priority ? (
                      <span style={{ fontSize: 11, color: PRIORITY_COLOR[t.priority] ?? 'var(--muted)', fontWeight: 500 }}>
                        {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                    {dueBadge(t) ?? <span style={{ fontSize: 11, color: 'var(--faint)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
