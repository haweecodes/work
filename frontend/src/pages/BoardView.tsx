import { useState, useEffect, useRef, useContext, lazy, Suspense, useMemo, useCallback, memo } from 'react';
import { Search, RefreshCw, Plus, Pencil, Hash } from 'lucide-react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
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

type DueDateState = 'overdue' | 'today' | 'normal';
function getDueDateState(dueDateStr: string): DueDateState {
  const due = new Date(dueDateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(todayStart.getTime() + 86_400_000);
  if (due < todayStart) return 'overdue';
  if (due < todayEnd)   return 'today';
  return 'normal';
}

const TaskCard = memo(function TaskCard({ task, onSelect, doneColumnId }: { task: Task; onSelect?: () => void; doneColumnId?: string }) {
  const [_, setSearchParams] = useSearchParams();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSelfDragging } = useSortable({ id: task.id });
  const setSelectedTask = useBoardStore(s => s.setSelectedTask);
  const selectedTask    = useBoardStore(s => s.selectedTask);
  const columns         = useBoardStore(s => s.columns);
  const isSelected      = selectedTask?.id === task.id;

  // Merge dnd-kit's setNodeRef with our own ref so we can scrollIntoView
  const cardElRef = useRef<HTMLDivElement | null>(null);
  const mergedRef = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    cardElRef.current = node;
  }, [setNodeRef]);

  useEffect(() => {
    if (isSelected) cardElRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [isSelected]);
  const [copiedKey, setCopiedKey] = useState(false);
  const style = { transform: CSS.Transform.toString(transform), transition } as React.CSSProperties;

  const allTasks = useMemo(() => columns.flatMap(c => c.tasks ?? []), [columns]);
  const subtasks = useMemo(() => allTasks.filter(t => t.parent_task_id === task.id), [allTasks, task.id]);
  const subtasksCount = subtasks.length;
  const completedSubtasksCount = useMemo(() => subtasks.filter(t => t.column_id === doneColumnId).length, [subtasks, doneColumnId]);
  const parentTask = useMemo(() => task.parent_task_id ? allTasks.find(t => t.id === task.parent_task_id) : null, [allTasks, task.parent_task_id]);

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
      ref={mergedRef}
      className={`relative bg-white rounded-xl shadow-card p-3.5 cursor-pointer
        hover:border-primary-200 hover:shadow-md transition-all duration-150 group flex flex-col gap-3
        ${isSelfDragging ? 'opacity-40' : ''}`}
      style={{
        ...style,
        border: isSelected ? '2px solid #6366f1' : '1px solid #F3F4F6',
        borderLeft: isSelected ? undefined
          : task.due_date && getDueDateState(task.due_date) === 'overdue' ? '3px solid #ef4444'
          : task.due_date && getDueDateState(task.due_date) === 'today'   ? '3px solid #f59e0b'
          : undefined,
      }}
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
      <div className="absolute top-3 right-3 text-gray-300 cursor-grab active:cursor-grabbing select-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
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
          {task.due_date && (() => {
            const ds = getDueDateState(task.due_date);
            return (
              <span className={`text-xs flex items-center gap-0.5 font-medium ${ds === 'overdue' ? 'text-red-500' : ds === 'today' ? 'text-amber-500' : 'text-gray-400 font-normal'}`}>
                {ds === 'overdue' && (
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                )}
                {format(new Date(task.due_date), 'MMM d')}
              </span>
            );
          })()}
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
}, (prev, next) =>
  prev.task === next.task &&
  prev.onSelect === next.onSelect &&
  prev.doneColumnId === next.doneColumnId
);

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

const Column = memo(function Column({ col, onAddTask, onTaskSelect, doneColumnId }: {
  col: ColumnType; onAddTask: (colId: string) => void; onTaskSelect: () => void; doneColumnId?: string;
}) {
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
            {col.tasks!.map(task => <TaskCard key={task.id} task={task} onSelect={onTaskSelect} doneColumnId={doneColumnId} />)}
          </div>
        </SortableContext>
      )}
    </div>
  );
});

// ── BoardView ─────────────────────────────────────────────────────────────────

export default function BoardView() {
  const { boardId } = useParams<{ boardId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const columns           = useBoardStore(s => s.columns);
  const fetchColumns      = useBoardStore(s => s.fetchColumns);
  const moveTaskLocally   = useBoardStore(s => s.moveTaskLocally);
  const updateTaskInColumn = useBoardStore(s => s.updateTaskInColumn);
  const boards            = useBoardStore(s => s.boards);
  const addColumn         = useBoardStore(s => s.addColumn);
  const selectedTask      = useBoardStore(s => s.selectedTask);
  const setSelectedTask   = useBoardStore(s => s.setSelectedTask);
  const updateBoardName    = useBoardStore(s => s.updateBoardName);
  const updateBoardTeam    = useBoardStore(s => s.updateBoardTeam);
  const updateBoardChannel = useBoardStore(s => s.updateBoardChannel);
  const addChannel         = useWorkspaceStore(s => s.addChannel);
  const channels           = useWorkspaceStore(s => s.channels);
  const navigate           = useNavigate();
  const socketRef = useContext(SocketContext);
  const user = useAuthStore(s => s.user);
  const role    = useWorkspaceStore(s => s.role);
  const members = useWorkspaceStore(s => s.members);
  const teams   = useWorkspaceStore(s => s.teams);
  const activeSidebar = useUIStore(s => s.activeSidebar);
  const openSidebar   = useUIStore(s => s.openSidebar);
  const closeSidebar  = useUIStore(s => s.closeSidebar);
  const showUpdatesPanel = activeSidebar?.type === 'board-updates' && activeSidebar.boardId === boardId;
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [createInColumn, setCreateInColumn] = useState<string | null>(null);
  const lastActiveColumnId = useRef<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssigneeIds, setFilterAssigneeIds] = useState<string[]>([]);
  const [filterPriorities,  setFilterPriorities]  = useState<string[]>([]);
  const [filterDueDate,     setFilterDueDate]     = useState<'overdue' | 'today' | 'this_week' | null>(null);
  const [showFilters,       setShowFilters]       = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [showChannelPopover, setShowChannelPopover] = useState(false);
  const [channelPrivate, setChannelPrivate] = useState(false);
  const [channelCreating, setChannelCreating] = useState(false);
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

  const doneColumnId = useMemo(
    () => [...columns].sort((a, b) => (b.position ?? 0) - (a.position ?? 0))[0]?.id,
    [columns]
  );

  const filteredColumns = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd   = new Date(todayStart.getTime() + 86_400_000);
    const weekEnd    = new Date(todayStart.getTime() + 7 * 86_400_000);
    return columns.map(col => ({
      ...col,
      tasks: (col.tasks ?? []).filter(t => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!t.title.toLowerCase().includes(q) && !t.task_key?.toLowerCase().includes(q)) return false;
        }
        if (filterAssigneeIds.length > 0) {
          const ids = t.assignees?.map(a => a.id) ?? [];
          if (!filterAssigneeIds.some(id => ids.includes(id))) return false;
        }
        if (filterPriorities.length > 0) {
          if (!filterPriorities.includes(t.priority ?? 'medium')) return false;
        }
        if (filterDueDate !== null) {
          if (!t.due_date) return false;
          const due = new Date(t.due_date);
          if (filterDueDate === 'overdue'   && !(due < todayStart)) return false;
          if (filterDueDate === 'today'     && !(due >= todayStart && due < todayEnd)) return false;
          if (filterDueDate === 'this_week' && !(due >= todayStart && due < weekEnd))  return false;
        }
        return true;
      }),
    }));
  }, [columns, searchQuery, filterAssigneeIds, filterPriorities, filterDueDate]);

  const handleTaskSelect = useCallback(() => closeSidebar(), [closeSidebar]);

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
    lastActiveColumnId.current = columnId;
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
              maxLength={80}
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
              <Pencil size={14} style={{ color: 'var(--faint)', flexShrink: 0, marginBottom: 1 }} />
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              {columns.reduce((acc, c) => acc + (c.tasks?.length ?? 0), 0)} tasks
            </p>
            {/* Team assignment */}
            {(() => {
              const assignedTeam = teams.find(t => t.id === board?.team_id);
              const canAssign = !!user && (role === 'admin' || board?.created_by === user.id);
              if (!assignedTeam && !canAssign) return null;
              return (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => canAssign && setShowTeamPicker(v => !v)}
                    style={{
                      fontSize: 11, fontWeight: 500, letterSpacing: '0.04em',
                      color: assignedTeam ? 'var(--paper)' : 'var(--faint)',
                      background: assignedTeam ? '#7C3AED' : 'transparent',
                      border: assignedTeam ? 'none' : '1px dashed var(--rule)',
                      padding: '2px 8px', cursor: canAssign ? 'pointer' : 'default',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { if (canAssign && !assignedTeam) e.currentTarget.style.borderColor = 'var(--ink)'; }}
                    onMouseLeave={e => { if (!assignedTeam) e.currentTarget.style.borderColor = 'var(--rule)'; }}
                  >
                    {assignedTeam ? `👥 ${assignedTeam.name}` : '+ Assign team'}
                  </button>
                  {showTeamPicker && canAssign && (
                    <>
                      <div className="fixed inset-0" style={{ zIndex: 49 }} onClick={() => setShowTeamPicker(false)} />
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
                        background: 'var(--paper)', border: '1px solid var(--rule)',
                        minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      }}>
                        {board?.team_id && (
                          <button
                            onClick={async () => {
                              await client.patch(`/api/boards/${boardId}`, { team_id: null });
                              updateBoardTeam(boardId!, null);
                              setShowTeamPicker(false);
                            }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderBottom: '1px solid var(--rule)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            Remove team
                          </button>
                        )}
                        {teams.length === 0 && (
                          <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--faint)' }}>No teams yet</div>
                        )}
                        {teams.map(t => (
                          <button key={t.id}
                            onClick={async () => {
                              await client.patch(`/api/boards/${boardId}`, { team_id: t.id });
                              updateBoardTeam(boardId!, t.id);
                              setShowTeamPicker(false);
                            }}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                              fontSize: 12, color: t.id === board?.team_id ? 'var(--ink)' : 'var(--ink-2)',
                              fontWeight: t.id === board?.team_id ? 600 : 400,
                              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            {t.id === board?.team_id ? '✓ ' : ''}{t.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          {/* Board channel button */}
          {(() => {
            const linkedChannel = board?.channel_id ? channels.find(c => c.id === board.channel_id) : null;
            if (linkedChannel) {
              return (
                <button
                  onClick={() => navigate(`/channel/${linkedChannel.id}`)}
                  style={{
                    fontSize: 11, fontWeight: 500, letterSpacing: '0.04em',
                    color: 'var(--paper)', background: '#6366f1',
                    border: 'none', padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                  title={`Open #${linkedChannel.name}`}
                >
                  <Hash size={10} />
                  {linkedChannel.name}
                </button>
              );
            }
            const canManage = !!user && (role === 'admin' || board?.created_by === user.id);
            if (!canManage) return null;
            return (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowChannelPopover(v => !v)}
                  style={{
                    fontSize: 11, fontWeight: 500, letterSpacing: '0.04em',
                    color: 'var(--faint)', background: 'transparent',
                    border: '1px dashed var(--rule)', padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--ink)')}
                  onMouseLeave={e => { if (!showChannelPopover) e.currentTarget.style.borderColor = 'var(--rule)'; }}
                >
                  <Hash size={10} />
                  Add channel
                </button>
                {showChannelPopover && (
                  <>
                    <div className="fixed inset-0" style={{ zIndex: 49 }} onClick={() => setShowChannelPopover(false)} />
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50,
                      background: 'var(--paper)', border: '1px solid var(--rule)',
                      minWidth: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 12,
                    }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Create board channel</p>
                      <div className="flex items-center gap-4 mb-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="bv-ch-priv" checked={!channelPrivate}
                            onChange={() => setChannelPrivate(false)} className="accent-primary-500" />
                          <span style={{ fontSize: 12, color: 'var(--ink)' }}>Public</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="bv-ch-priv" checked={channelPrivate}
                            onChange={() => setChannelPrivate(true)} className="accent-primary-500" />
                          <span style={{ fontSize: 12, color: 'var(--ink)' }}>Private</span>
                        </label>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 10 }}>
                        # {board?.name.trim().toLowerCase().replace(/\s+/g, '-') ?? 'board-channel'}
                      </p>
                      <button
                        disabled={channelCreating}
                        onClick={async () => {
                          if (!boardId || channelCreating) return;
                          setChannelCreating(true);
                          try {
                            const { data } = await client.post(`/api/boards/${boardId}/channel`, { is_private: channelPrivate });
                            updateBoardChannel(boardId, data.id);
                            addChannel(data);
                            setShowChannelPopover(false);
                            navigate(`/channel/${data.id}`);
                          } catch { /* ignore */ } finally {
                            setChannelCreating(false);
                          }
                        }}
                        className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-60"
                        style={{ fontSize: 12 }}
                      >
                        {channelCreating ? 'Creating…' : 'Create channel'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
          </div>
        </div>
        <div className="flex items-baseline gap-6">
          <div className="relative flex items-baseline">
            <Search size={14} style={{ color: 'var(--faint)', position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)' }} />
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
          {(() => {
            const activeFilterCount = filterAssigneeIds.length + filterPriorities.length + (filterDueDate ? 1 : 0);
            return (
              <button
                onClick={() => setShowFilters(v => !v)}
                style={{
                  fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: activeFilterCount > 0 ? 'var(--ink)' : showFilters ? 'var(--ink)' : 'var(--muted)',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                onMouseLeave={e => { if (!showFilters && activeFilterCount === 0) e.currentTarget.style.color = 'var(--muted)'; }}>
                Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
            );
          })()}
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
            <span className="flex items-center gap-1.5">
              <RefreshCw size={12} />
              Request Updates
            </span>
          </button>
          <button onClick={() => handleAddTask(lastActiveColumnId.current ?? columns[0]?.id)} className="btn-primary flex items-center gap-1.5">
            <Plus size={14} />
            New task
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex items-center gap-6 flex-wrap flex-shrink-0"
          style={{ padding: '10px 40px', borderBottom: '1px solid var(--rule)', background: 'var(--paper)' }}>

          {/* Priority */}
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)' }}>Priority</span>
            {(['low', 'medium', 'high', 'critical'] as const).map(p => (
              <button key={p} type="button"
                onClick={() => setFilterPriorities(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${filterPriorities.includes(p) ? PRIORITY_BADGE[p] + ' ring-1 ring-current' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'}`}>
                {p}
              </button>
            ))}
          </div>

          {/* Assignee */}
          {members.length > 0 && (
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)' }}>Assignee</span>
              {members.map(m => (
                <button key={m.id} type="button"
                  onClick={() => setFilterAssigneeIds(prev => prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                  title={m.name}
                  style={{ opacity: filterAssigneeIds.includes(m.id) ? 1 : 0.35, transition: 'opacity 0.15s' }}
                  className="hover:opacity-80">
                  <img src={m.avatar_url} className="w-5 h-5 rounded-full" alt={m.name} />
                </button>
              ))}
            </div>
          )}

          {/* Due date */}
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)' }}>Due</span>
            <select
              value={filterDueDate ?? ''}
              onChange={e => setFilterDueDate((e.target.value || null) as typeof filterDueDate)}
              style={{ fontSize: 12, color: filterDueDate ? 'var(--ink)' : 'var(--muted)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--rule)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', paddingBottom: 2 }}>
              <option value="">Any</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="this_week">This week</option>
            </select>
          </div>

          {/* Clear */}
          {(filterAssigneeIds.length > 0 || filterPriorities.length > 0 || filterDueDate) && (
            <button type="button"
              onClick={() => { setFilterAssigneeIds([]); setFilterPriorities([]); setFilterDueDate(null); }}
              style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
              Clear
            </button>
          )}
        </div>
      )}

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
            {filteredColumns.map(col => (
              <Column key={col.id} col={col} onAddTask={handleAddTask} onTaskSelect={handleTaskSelect} doneColumnId={doneColumnId} />
            ))}

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
