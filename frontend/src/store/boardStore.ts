import { create } from 'zustand';
import client from '../api/client';
import type { Board, Column, Task } from '../types';

interface BoardState {
  boards: Board[];
  currentBoard: { id: string } | null;
  columns: Column[];
  selectedTask: Task | null;
  fetchBoards: (workspaceId: string) => Promise<Board[]>;
  fetchColumns: (boardId: string) => Promise<Column[]>;
  setCurrentBoard: (board: { id: string } | null) => void;
  setSelectedTask: (task: Task | null) => void;
  updateTaskInColumn: (updatedTask: Task) => void;
  removeTask: (taskId: string) => void;
  moveTaskLocally: (taskId: string, fromColId: string, toColId: string, newIndex: number) => void;
  addColumn: (col: Omit<Column, 'tasks'>) => void;
  addTaskToColumn: (task: Task) => void;
}

const useBoardStore = create<BoardState>((set) => ({
  boards: [],
  currentBoard: null,
  columns: [],
  selectedTask: null,

  fetchBoards: async (workspaceId: string) => {
    const { data } = await client.get<Board[]>(`/api/boards/${workspaceId}`);
    set({ boards: data });
    return data;
  },

  fetchColumns: async (boardId: string) => {
    const { data } = await client.get<Column[]>(`/api/boards/${boardId}/columns`);
    set({ columns: data, currentBoard: { id: boardId } });
    return data;
  },

  setCurrentBoard: (board) => set({ currentBoard: board }),
  setSelectedTask: (task) => set({ selectedTask: task }),

  updateTaskInColumn: (updatedTask: Task) => {
    set((s) => ({
      columns: s.columns.map(col => {
        // If this is the column the task now belongs to:
        if (col.id === updatedTask.column_id) {
          // Update it if it's already there, or add it if it moved here
          return {
            ...col,
            tasks: col.tasks.some(t => t.id === updatedTask.id)
              ? col.tasks.map(t => t.id === updatedTask.id ? updatedTask : t)
              : [...col.tasks, updatedTask]
          };
        }
        // If it's any other column, ensure the task is removed (in case it just moved out)
        return {
          ...col,
          tasks: col.tasks.filter(t => t.id !== updatedTask.id)
        };
      })
    }));
  },

  removeTask: (taskId: string) => {
    set((s) => ({
      columns: s.columns.map(col => ({
        ...col,
        tasks: col.tasks.filter(t => t.id !== taskId)
      })),
      selectedTask: s.selectedTask?.id === taskId ? null : s.selectedTask
    }));
  },

  moveTaskLocally: (taskId: string, fromColId: string, toColId: string, newIndex: number) => {
    set((s) => {
      const cols = s.columns.map(col => ({ ...col, tasks: [...col.tasks] }));
      const fromCol = cols.find(c => c.id === fromColId);
      const toCol = cols.find(c => c.id === toColId);
      if (!fromCol || !toCol) return {};
      const taskIdx = fromCol.tasks.findIndex(t => t.id === taskId);
      if (taskIdx === -1) return {};
      const [task] = fromCol.tasks.splice(taskIdx, 1);
      task.column_id = toColId;
      task.column_title = toCol.title;
      toCol.tasks.splice(newIndex, 0, task);
      return { columns: cols };
    });
  },

  addColumn: (col) => set((s) => ({ columns: [...s.columns, { ...col, tasks: [] }] })),

  addTaskToColumn: (task: Task) => {
    set((s) => ({
      columns: s.columns.map(col =>
        col.id === task.column_id ? { ...col, tasks: [...col.tasks, task] } : col
      )
    }));
  },
}));

export default useBoardStore;
