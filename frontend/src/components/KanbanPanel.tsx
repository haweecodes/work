import { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useBoardStore from '../store/boardStore';
import client from '../api/client';
import type { Column, Task } from '../types';

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

interface Props {
  columns: Column[];
  userId: string;
  sortBy: 'default' | 'priority' | 'due_date';
  filterColId: string | null;
  boardId?: string;
}

function dueDateState(dateStr: string): 'overdue' | 'soon' | 'normal' {
  const due = new Date(dateStr);
  const now = new Date();
  if (due < now) return 'overdue';
  if (due.getTime() - now.getTime() < 3 * 24 * 60 * 60 * 1000) return 'soon';
  return 'normal';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function KanbanPanel({ columns, userId, sortBy, filterColId, boardId }: Props) {
  const navigate = useNavigate();
  const { setSelectedTask, updateTaskInColumn } = useBoardStore();
  const [transitionTaskId, setTransitionTaskId] = useState<string | null>(null);
  const [movingTaskId, setMovingTaskId]         = useState<string | null>(null);
  const [focusedIdx, setFocusedIdx]             = useState<number>(-1);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleMove = async (task: Task, targetColId: string) => {
    if (task.column_id === targetColId) { setTransitionTaskId(null); return; }
    setMovingTaskId(task.id);
    try {
      const { data } = await client.patch(`/api/tasks/${task.id}`, { column_id: targetColId });
      updateTaskInColumn(data);
    } finally {
      setMovingTaskId(null);
      setTransitionTaskId(null);
    }
  };

  const visibleCols = useMemo(() =>
    columns
      .filter(col => !filterColId || col.id === filterColId)
      .map(col => ({
        ...col,
        tasks: col.tasks
          .filter(t => t.assignees?.some(a => a.id === userId))
          .sort((a, b) => {
            if (sortBy === 'priority')
              return (PRIORITY_ORDER[a.priority ?? ''] ?? 4) - (PRIORITY_ORDER[b.priority ?? ''] ?? 4);
            if (sortBy === 'due_date') {
              if (!a.due_date && !b.due_date) return 0;
              if (!a.due_date) return 1;
              if (!b.due_date) return -1;
              return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
            }
            return 0;
          }),
      })),
    [columns, filterColId, userId, sortBy],
  );

  const totalVisible = useMemo(() => visibleCols.reduce((s, c) => s + c.tasks.length, 0), [visibleCols]);
  const flatTasks = useMemo(() => visibleCols.flatMap(c => c.tasks), [visibleCols]);

  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    if (flatTasks.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(focusedIdx + 1, flatTasks.length - 1);
      setFocusedIdx(next);
      cardRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(focusedIdx - 1, 0);
      setFocusedIdx(prev);
      cardRefs.current[prev]?.focus();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }} onKeyDown={handleContainerKeyDown}>
        {totalVisible === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 text-center px-7 py-10 flex-1">
            <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>No tasks assigned to you</p>
            <p style={{ fontSize: 12, color: 'var(--faint)' }}>Tasks assigned to you appear here</p>
          </div>
        ) : (() => {
          let flatIdx = 0;
          return visibleCols.map(col => col.tasks.length > 0 && (
            <div key={col.id}>
              {/* Column label */}
              <div
                className="flex items-center gap-3 px-7 py-4"
                style={{ borderBottom: '1px solid var(--rule)' }}
              >
                <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 500 }}>
                  {col.title}
                </span>
                <span style={{ fontSize: 10, color: 'var(--faint)', fontVariantNumeric: 'tabular-nums' }}>
                  {col.tasks.length}
                </span>
              </div>

              {/* Task rows */}
              {col.tasks.map(task => {
                const dateState = task.due_date ? dueDateState(task.due_date) : null;
                const isOpen    = transitionTaskId === task.id;
                const isMoving  = movingTaskId === task.id;
                const cardIdx   = flatIdx++;
                const isFocused = focusedIdx === cardIdx;

                // Priority text
                const priorityLabel = task.priority
                  ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1)
                  : null;
                const priorityColor = task.priority === 'critical' || task.priority === 'high'
                  ? 'var(--ink)'
                  : task.priority === 'medium'
                    ? 'var(--ink-2)'
                    : 'var(--faint)';

                return (
                  <div
                    key={task.id}
                    ref={el => { cardRefs.current[cardIdx] = el; }}
                    tabIndex={0}
                    className="outline-none"
                    style={{ borderBottom: `1px solid var(--rule-2)`, outline: isFocused ? `1px solid var(--rule)` : 'none' }}
                    onFocus={() => setFocusedIdx(cardIdx)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!isOpen) setSelectedTask(task); }
                    }}
                  >
                    {/* Main row */}
                    <div
                      className="cursor-pointer px-7 py-2.5"
                      onClick={() => { if (!isOpen) setSelectedTask(task); }}
                      onMouseEnter={e => (e.currentTarget.parentElement!.style.background = 'var(--paper-2)')}
                      onMouseLeave={e => (e.currentTarget.parentElement!.style.background = 'transparent')}
                    >
                      {/* Top: task key + assignees */}
                      <div className="flex items-center justify-between mb-1">
                        <span style={{ fontSize: 10, color: 'var(--faint)', letterSpacing: '0.1em', fontVariantNumeric: 'tabular-nums' }}>
                          {task.task_key}
                        </span>
                        {task.assignees && task.assignees.length > 0 && (
                          <div className="flex -space-x-1">
                            {task.assignees.slice(0, 2).map(a => (
                              <img key={a.id} src={a.avatar_url} className="w-4 h-4 rounded-full"
                                style={{ border: '1px solid var(--paper)' }} alt={a.name} title={a.name} />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Title */}
                      <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.45, letterSpacing: '-0.005em', marginBottom: 4,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {task.title}
                      </p>

                      {/* Meta row */}
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline gap-3">
                          {priorityLabel && (
                            <span style={{ fontSize: 10, color: priorityColor, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: task.priority === 'high' || task.priority === 'critical' ? 500 : 400 }}>
                              {priorityLabel}
                            </span>
                          )}
                          {task.due_date && (
                            <span style={{ fontSize: 11, color: dateState === 'overdue' ? 'var(--danger)' : 'var(--faint)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
                              {dateState === 'overdue' ? `Overdue · ${formatDate(task.due_date)}` : formatDate(task.due_date)}
                            </span>
                          )}
                        </div>

                        {/* Move button */}
                        <button
                          onClick={e => { e.stopPropagation(); setTransitionTaskId(isOpen ? null : task.id); }}
                          style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: isOpen ? 'var(--ink)' : 'var(--faint)' }}
                          onMouseEnter={e => { if (!isOpen) e.currentTarget.style.color = 'var(--ink)'; }}
                          onMouseLeave={e => { if (!isOpen) e.currentTarget.style.color = 'var(--faint)'; }}
                        >
                          Move
                        </button>
                      </div>
                    </div>

                    {/* Inline column picker */}
                    {isOpen && (
                      <div
                        className="px-7 pb-3"
                        style={{ borderTop: '1px solid var(--rule-2)' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <p style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)', marginTop: 10, marginBottom: 8 }}>
                          Move to
                        </p>
                        <div className="flex flex-col gap-0">
                          {columns.map(c => {
                            const isCurrent   = c.id === task.column_id;
                            const isMovingHere = isMoving && c.id !== task.column_id;
                            return (
                              <button
                                key={c.id}
                                onClick={() => handleMove(task, c.id)}
                                disabled={isCurrent || isMoving}
                                className="flex items-center justify-between py-1.5 text-left"
                                style={{ fontSize: 13, color: isCurrent ? 'var(--ink)' : 'var(--ink-2)', fontWeight: isCurrent ? 500 : 400, background: 'transparent' }}
                                onMouseEnter={e => { if (!isCurrent && !isMoving) e.currentTarget.style.color = 'var(--ink)'; }}
                                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.color = isCurrent ? 'var(--ink)' : 'var(--ink-2)'; }}
                              >
                                <span>{c.title}</span>
                                {isCurrent && <span style={{ fontSize: 11, color: 'var(--faint)' }}>current</span>}
                                {isMovingHere && <span style={{ fontSize: 11, color: 'var(--faint)' }}>…</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ));
        })()}
      </div>

      {boardId && (
        <button
          onClick={() => navigate(`/board/${boardId}`)}
          className="flex-shrink-0 w-full text-left px-7 py-4 transition-colors"
          style={{ borderTop: '1px solid var(--rule)', fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.background = 'var(--paper-2)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.textDecoration = 'none'; e.currentTarget.style.background = 'transparent'; }}
        >
          View full board →
        </button>
      )}
    </div>
  );
}
