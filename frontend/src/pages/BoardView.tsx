import { useState, useEffect, useRef, useContext, lazy, Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';
import useUIStore from '../store/uiStore';
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import client from '../api/client';
import useBoardStore from '../store/boardStore';
import SocketContext from '../context/SocketContext';
import { BoardSkeleton } from '../components/Skeleton';
import type { Task, Column as ColumnType } from '../types';

// Lazily loaded — only needed when the user clicks "+ New task"
const CreateTaskModal = lazy(() => import('../components/CreateTaskModal'));

const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-emerald-400', medium: 'bg-amber-400',
  high: 'bg-orange-500', critical: 'bg-red-500',
};
const PRIORITY_BADGE: Record<string, string> = {
  low: 'text-emerald-700 bg-emerald-50', medium: 'text-amber-700 bg-amber-50',
  high: 'text-orange-700 bg-orange-50', critical: 'text-red-700 bg-red-50',
};

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({ task, onSelect }: { task: Task; onSelect?: () => void }) {
  const [_, setSearchParams] = useSearchParams();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSelfDragging } = useSortable({ id: task.id });
  const { setSelectedTask, columns } = useBoardStore();
  const [copiedKey, setCopiedKey] = useState(false);
  const style = { transform: CSS.Transform.toString(transform), transition };

  const allTasks = columns.flatMap(c => c.tasks ?? []);
  const subtasks = allTasks.filter(t => t.parent_task_id === task.id);
  const subtasksCount = subtasks.length;
  const doneColumnId = [...columns].sort((a, b) => (b.position ?? 0) - (a.position ?? 0))[0]?.id;
  const completedSubtasksCount = subtasks.filter(t => t.column_id === doneColumnId).length;
  const parentTask = task.parent_task_id ? allTasks.find(t => t.id === task.parent_task_id) : null;

  const handleCopyKey = (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent opening the detail panel
    if (task.task_key) {
      navigator.clipboard.writeText(window.location.origin + '/t/' + task.task_key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative bg-white rounded-xl border border-gray-100 shadow-card p-3.5 cursor-pointer
        hover:border-primary-200 hover:shadow-md transition-all duration-150 group flex flex-col gap-3
        ${isSelfDragging ? 'opacity-40' : ''}`}
      onClick={() => {
        onSelect?.();
        if (task.task_key) {
          setSearchParams({ taskKey: task.task_key }, { replace: true });
          setSelectedTask(task);
        } else {
          setSelectedTask(task);
        }
      }}
      {...attributes}
      {...listeners}
    >
      {/* Drag handle — top right */}
      <div className="absolute top-3 right-3 text-gray-300 cursor-grab active:cursor-grabbing select-none">
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
          <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
          <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
          <circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
        </svg>
      </div>

      <div className="flex items-start gap-2">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${PRIORITY_DOT[task.priority || 'medium'] || 'bg-gray-300'}`} />
        <div className="flex flex-col flex-1 min-w-0">
          {task.task_key && (
            <button
              onClick={handleCopyKey}
              title="Copy task ID"
              className="text-[10px] font-bold text-gray-400 tracking-wide hover:text-primary-600 transition-colors flex items-center gap-1 group/copy w-max"
            >
              {task.task_key}
              {copiedKey ? (
                <svg className="w-2.5 h-2.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}
          <p className="text-sm font-medium text-gray-900 leading-snug group-hover:text-primary-700 transition-colors mt-0.5">
            {task.title}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${PRIORITY_BADGE[task.priority || 'medium'] || 'text-gray-500 bg-gray-100'}`}>
            {task.priority || 'medium'}
          </span>
          {task.column_title && (
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
              {task.column_title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.due_date && (
            <span className="text-xs text-gray-400">{format(new Date(task.due_date), 'MMM d')}</span>
          )}
          {task.assignees && task.assignees.length > 0 && (
            <div className="flex -space-x-1">
              {task.assignees.slice(0, 3).map(a => (
                <img key={a.id} src={a.avatar_url} className="w-5 h-5 rounded-full border-2 border-white" title={a.name} />
              ))}
            </div>
          )}
        </div>
      </div>

      {task.linked_message_id && (
        <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-1 text-xs text-gray-400">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          From message
        </div>
      )}

      {(parentTask || subtasksCount > 0) && (
        <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between text-[10px] font-medium text-gray-400">
          {parentTask ? (
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Child of {parentTask.title.length > 15 ? parentTask.title.slice(0, 15) + '...' : parentTask.title}
            </div>
          ) : <span />}
          {subtasksCount > 0 && (
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${completedSubtasksCount === subtasksCount ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              {completedSubtasksCount}/{subtasksCount}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

/**
 * A dedicated droppable zone rendered inside empty columns.
 * It registers its own useDroppable(colId) so dnd-kit's collision detection
 * always has a real DOM node to measure against.
 */
function EmptyDropZone({ colId, onAddTask }: { colId: string; onAddTask: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: colId });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed min-h-[120px] text-center transition-colors ${isOver
          ? 'border-primary-400 bg-primary-50/60'
          : 'border-gray-200 bg-transparent'
        }`}
    >
      <p className="text-xs text-gray-400">{isOver ? 'Drop here' : 'No tasks yet'}</p>
      {!isOver && (
        <button
          onClick={onAddTask}
          className="text-xs text-primary-500 hover:text-primary-600 mt-1 font-medium"
        >
          + Add task
        </button>
      )}
    </div>
  );
}

function Column({ col, onAddTask, onTaskSelect }: { col: ColumnType; onAddTask: (colId: string) => void; onTaskSelect: () => void }) {
  const isEmpty = !col.tasks || col.tasks.length === 0;
  const sortableItems = isEmpty ? [] : col.tasks!.map(t => t.id);

  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-gray-50/80 rounded-2xl p-3 h-full">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-gray-700">{col.title}</h3>
          <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 text-xs flex items-center justify-center font-medium">
            {col.tasks?.length ?? 0}
          </span>
        </div>
        <button
          onClick={() => onAddTask(col.id)}
          className="p-1 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {isEmpty ? (
        /* When empty: just the dedicated droppable zone, no SortableContext needed */
        <EmptyDropZone colId={col.id} onAddTask={() => onAddTask(col.id)} />
      ) : (
        <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
          <div className="flex-1 overflow-y-auto space-y-2 min-h-[60px]" style={{ scrollbarWidth: 'thin' }}>
            {col.tasks!.map(task => <TaskCard key={task.id} task={task} onSelect={onTaskSelect} />)}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

// ── BoardView ─────────────────────────────────────────────────────────────────

export default function BoardView() {
  const { boardId } = useParams<{ boardId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { columns, fetchColumns, moveTaskLocally, updateTaskInColumn, boards, addColumn, selectedTask, setSelectedTask, updateBoardName } = useBoardStore();
  const socketRef = useContext(SocketContext);
  const user = useAuthStore(s => s.user);
  const { role } = useWorkspaceStore();
  const { activeSidebar, openSidebar, closeSidebar } = useUIStore();
  const showUpdatesPanel = activeSidebar?.type === 'board-updates' && activeSidebar.boardId === boardId;
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [createInColumn, setCreateInColumn] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const newColInputRef = useRef<HTMLInputElement>(null);

  /**
   * Tracks which column the pointer was last over during a drag.
   * Used as a fallback in handleDragEnd when over.id resolves to a sentinel
   * or doesn't match any column or task in the current snapshot.
   */
  const overColumnIdRef = useRef<string | null>(null);

  const board = boards.find(b => b.id === boardId);
  const canRequest = !!user && (role === 'admin' || board?.created_by === user.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Open updates panel when navigated from a task_update_response notification
  useEffect(() => {
    if (searchParams.get('updates') === '1') {
      if (boardId) openSidebar({ type: 'board-updates', boardId, canRequest });
      setSearchParams({}, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    console.log('[BoardView] Mount/Update useEffect triggered with boardId:', boardId);
    if (!boardId) {
      console.warn('[BoardView] No boardId available in params!');
      return;
    }

    console.log('[BoardView] Calling fetchColumns for boardId:', boardId);
    setLoading(true);
    fetchColumns(boardId)
      .then(res => console.log('[BoardView] fetchColumns successful. Columns count:', res.length))
      .catch(err => console.error('[BoardView] fetchColumns error:', err))
      .finally(() => {
        console.log('[BoardView] fetchColumns finally block, setting loading false');
        setLoading(false);
      });

    const socket = socketRef?.current;
    // Use named handler so cleanup only removes this specific listener
    const handleTaskUpdated = ({ type, task }: { type: string; task: Task }) => {
      if (type === 'created' || type === 'moved' || type === 'updated') updateTaskInColumn(task);
    };
    if (socket) {
      socket.emit('join_board', boardId);
      socket.on('task_updated', handleTaskUpdated);
    }
    return () => { if (socket) socket.off('task_updated', handleTaskUpdated); };
  }, [boardId, fetchColumns, updateTaskInColumn, socketRef]);

  useEffect(() => {
    // UNIDIRECTIONAL SYNC: URL -> State
    // We only read from the URL to hydrate the selection or handle URL changes.
    // If we deliberately closed it, the search param will be null or empty string.
    if (loading) return;
    
    const urlTaskKey = searchParams.get('taskKey');
    
    if (urlTaskKey) {
      const allTasks = columns.flatMap(c => c.tasks ?? []);
      const target = allTasks.find(t => t.task_key === urlTaskKey);
      if (target) {
        if (target.id !== selectedTask?.id) {
          setSelectedTask(target);
          closeSidebar();   // task open → close notifications / updates
        }
      } else {
        // The URL specifies a taskKey but it's not found on this board.
        // E.g. an invalid URL, or the task was deleted.
        if (selectedTask) setSelectedTask(null);
      }
    } else if (selectedTask) {
      // If the URL has no taskKey, it means we closed the panel or navigated away.
      // So we clear the internal state.
      setSelectedTask(null);
    }
  }, [searchParams, columns, loading, selectedTask?.id, setSelectedTask]);

  // We DO NOT write selectedTask back to the URL aggressively.
  // When a user clicks a task, TaskCard sets it in the URL via history manipulation,
  // OR the user clicks close in TaskDetailPanel which explicitly clears the search param.

  const handleDragStart = (event: DragStartEvent) => {
    const task = columns.flatMap(c => c.tasks ?? []).find(t => t.id === event.active.id);
    setActiveTask(task ?? null);
    overColumnIdRef.current = null;
  };

  /**
   * Called continuously during drag. Keeps overColumnIdRef up-to-date so
   * handleDragEnd can always resolve the correct destination column.
   */
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) { overColumnIdRef.current = null; return; }

    const overId = String(over.id);

    // Direct hit on a column or EmptyDropZone (both register with col.id)
    const col = columns.find(c => c.id === overId);
    if (col) { overColumnIdRef.current = col.id; return; }

    // Hit on a task card — find which column owns it
    const owner = columns.find(c => c.tasks?.some(t => t.id === overId));
    if (owner) overColumnIdRef.current = owner.id;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const fromCol = columns.find(c => c.tasks?.some(t => t.id === active.id));
    const overId = String(over.id);

    // Resolve target column:
    // (1) over.id is a column id (direct hit or EmptyDropZone)
    // (2) over.id is a task id inside a column
    // (3) fallback: last column tracked in onDragOver
    const toCol =
      columns.find(c => c.id === overId) ||
      columns.find(c => c.tasks?.some(t => t.id === overId)) ||
      (overColumnIdRef.current ? columns.find(c => c.id === overColumnIdRef.current) : undefined);

    if (!fromCol || !toCol) return;
    if (active.id === over.id && fromCol.id === toCol.id) return;

    const toTasks = toCol.tasks ?? [];
    let newIndex = toTasks.length; // default: append at end

    // When over.id is a task (not a column id), use that task's position
    if (overId !== toCol.id) {
      const idx = toTasks.findIndex(t => t.id === overId);
      if (idx !== -1) newIndex = idx;
    }

    moveTaskLocally(active.id as string, fromCol.id, toCol.id, newIndex);

    try {
      if (!boardId) return;
      await client.patch(`/api/tasks/${active.id}/move`, { column_id: toCol.id, position: newIndex });
    } catch (err) {
      console.error('Move failed — reverting', err);
      if (boardId) fetchColumns(boardId);
    }
  };

  const handleAddTask = (columnId: string) => {
    setCreateInColumn(columnId);
    setShowCreateTask(true);
  };

  const handleAddColumn = () => {
    setNewColName('');
    setShowAddColumn(true);
    setTimeout(() => newColInputRef.current?.focus(), 50);
  };

  const submitNewColumn = async () => {
    const title = newColName.trim();
    if (!title || !boardId) { setShowAddColumn(false); return; }
    const { data } = await client.post(`/api/boards/${boardId}/columns`, { title });
    addColumn(data);
    setShowAddColumn(false);
    setNewColName('');
  };

  const handleNameEdit = () => {
    setNameValue(board?.name || '');
    setEditingName(true);
  };

  const submitNameEdit = async () => {
    const trimmed = nameValue.trim();
    setEditingName(false);
    if (!trimmed || trimmed === board?.name || !boardId) return;
    await client.patch(`/api/boards/${boardId}`, { name: trimmed });
    updateBoardName(boardId, trimmed);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-surface">
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="animate-pulse">
            <div className="h-4 w-32 bg-gray-200 rounded mb-1" />
            <div className="h-3 w-16 bg-gray-100 rounded" />
          </div>
        </div>
        <div className="flex-1 overflow-x-auto">
          <BoardSkeleton columns={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--paper)' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0"
        style={{ padding: '22px 40px 18px', borderBottom: '1px solid var(--rule)', background: 'var(--paper)' }}>
        <div>
          {editingName ? (
            <input
              autoFocus
              style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--ink)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--ink)', outline: 'none', width: 280, fontFamily: 'inherit' }}
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={submitNameEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') submitNameEdit();
                if (e.key === 'Escape') setEditingName(false);
              }}
            />
          ) : (
            <button onClick={handleNameEdit}
              className="group flex items-center gap-2"
              style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--ink)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink-2)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink)')}>
              {board?.name || 'Board'}
              <svg className="w-3.5 h-3.5 flex-shrink-0"
                style={{ color: 'var(--faint)', marginBottom: 1 }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {columns.reduce((acc, c) => acc + (c.tasks?.length ?? 0), 0)} tasks
          </p>
        </div>
        <div className="flex items-baseline gap-6">
          <div className="relative flex items-baseline">
            <svg className="w-3.5 h-3.5 absolute left-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--faint)', top: '50%', transform: 'translateY(-50%)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ fontSize: 13, color: 'var(--ink)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--rule)', outline: 'none', paddingLeft: 20, paddingBottom: 2, width: 140, fontFamily: 'inherit' }}
              onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--ink)')}
              onBlur={e => (e.currentTarget.style.borderBottomColor = 'var(--rule)')}
            />
          </div>
          <button
            onClick={() => {
              if (showUpdatesPanel) {
                closeSidebar();
              } else {
                openSidebar({ type: 'board-updates', boardId: boardId!, canRequest });
                setSelectedTask(null);
                setSearchParams({}, { replace: true });
              }
            }}
            style={{
              fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: showUpdatesPanel ? 'var(--ink)' : 'var(--muted)',
              textDecoration: showUpdatesPanel ? 'underline' : 'none',
              textUnderlineOffset: 3,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => { if (!showUpdatesPanel) e.currentTarget.style.color = 'var(--muted)'; }}>
            Request Updates
          </button>
          <button onClick={() => handleAddTask(columns[0]?.id)} className="btn-primary">
            + New task
          </button>
        </div>
      </div>

      {/* Board canvas */}
      <div className="flex-1 overflow-x-auto p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full min-w-max">
            {columns.map(col => {
              const filteredCol = {
                ...col,
                tasks: (col.tasks ?? []).filter(t => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  return t.title.toLowerCase().includes(q) || t.task_key?.toLowerCase().includes(q);
                })
              };
              return <Column key={col.id} col={filteredCol} onAddTask={handleAddTask} onTaskSelect={closeSidebar} />;
            })}

            {/* Inline "Add column" card */}
            {showAddColumn ? (
              <div className="flex-shrink-0 w-72 bg-gray-50/80 rounded-2xl p-3 border-2 border-dashed border-primary-300">
                <input
                  ref={newColInputRef}
                  className="w-full text-sm font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none mb-2"
                  style={{ borderColor: '#818cf8' }}
                  placeholder="Column name"
                  value={newColName}
                  onChange={e => setNewColName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') submitNewColumn();
                    if (e.key === 'Escape') setShowAddColumn(false);
                  }}
                />
                <div className="flex gap-1.5">
                  <button onClick={submitNewColumn} className="btn-primary text-xs px-3 py-1">Add</button>
                  <button onClick={() => setShowAddColumn(false)} className="btn-ghost text-xs px-3 py-1">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleAddColumn}
                className="flex-shrink-0 w-72 flex items-center justify-center gap-2 h-12 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add column
              </button>
            )}

            {columns.length === 0 && !showAddColumn && (
              <div className="flex items-center justify-center w-full">
                <div className="text-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-1">No columns yet</p>
                  <button onClick={handleAddColumn} className="btn-primary text-sm">Add first column</button>
                </div>
              </div>
            )}
          </div>

          <DragOverlay>
            {activeTask && (
              <div className="bg-white rounded-xl border border-primary-300 shadow-lg p-3.5 w-72 rotate-1 opacity-90">
                <p className="text-sm font-medium text-gray-900">{activeTask.title}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {showCreateTask && columns.length > 0 && boardId && (
        <Suspense fallback={null}>
          <CreateTaskModal
            boardId={boardId}
            createInColumn={createInColumn || undefined}
            onClose={() => {
              setShowCreateTask(false);
              setCreateInColumn(null);
            }}
          />
        </Suspense>
      )}

      {/* Updates panel — fixed right overlay */}
    </div>
  );
}
