import { useState } from 'react';
import KanbanPanel from './KanbanPanel';
import type { Column } from '../types';

interface Props {
  columns: Column[];
  userId: string;
  boardId?: string;
  title?: string;
  onClose: () => void;
}

export default function TaskTray({ columns, userId, boardId, title = 'My Tasks', onClose }: Props) {
  const [sortBy, setSortBy]           = useState<'default' | 'priority' | 'due_date'>('default');
  const [filterColId, setFilterColId] = useState<string | null>(null);

  return (
    <>
      {/* Header */}
      <div className="flex-shrink-0" style={{ borderBottom: '1px solid var(--rule)' }}>
        <div className="flex items-center justify-between px-7 py-5">
          <h3 style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 500 }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{ fontSize: 12, color: 'var(--faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}
          >
            Close
          </button>
        </div>

        {/* Filter + sort */}
        <div className="flex items-center gap-5 px-7 pb-4">
          <div>
            <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginRight: 6 }}>
              Column
            </span>
            <select
              value={filterColId ?? ''}
              onChange={e => setFilterColId(e.target.value || null)}
              style={{
                fontSize: 12, color: filterColId ? 'var(--ink)' : 'var(--muted)',
                background: 'transparent', cursor: 'pointer', outline: 'none',
                borderBottom: `1px solid ${filterColId ? 'var(--ink)' : 'transparent'}`,
                fontFamily: 'inherit',
              }}
            >
              <option value="">All</option>
              {columns.map(col => <option key={col.id} value={col.id}>{col.title}</option>)}
            </select>
          </div>
          <div>
            <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginRight: 6 }}>
              Sort
            </span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              style={{
                fontSize: 12, color: sortBy !== 'default' ? 'var(--ink)' : 'var(--muted)',
                background: 'transparent', cursor: 'pointer', outline: 'none',
                borderBottom: `1px solid ${sortBy !== 'default' ? 'var(--ink)' : 'transparent'}`,
                fontFamily: 'inherit',
              }}
            >
              <option value="default">Default</option>
              <option value="priority">Priority</option>
              <option value="due_date">Due date</option>
            </select>
          </div>
        </div>
      </div>

      <KanbanPanel
        columns={columns}
        userId={userId}
        sortBy={sortBy}
        filterColId={filterColId}
        boardId={boardId}
      />
    </>
  );
}
