import { create } from 'zustand';
import client from '../api/client';
import type { Board, Column, Task } from '../types';

interface BoardState {
  boards: Board[];
  columns: Column[];
  selectedTask: Task | null;
  fetchBoards: (workspaceId: string) => Promise<Board[]>;
  fetchColumns: (boardId: string) => Promise<Column[]>;
  setSelectedTask: (task: Task | null) => void;
  updateTaskInColumn: (updatedTask: Task) => void;
  removeTask: (taskId: string) => void;
  moveTaskLocally: (taskId: string, fromColId: string, toColId: string, newIndex: number) => void;
  addColumn: (col: Omit<Column, 'tasks'>) => void;
  updateBoardName: (id: string, name: string) => void;
}

const useBoardStore = create<BoardState>((set) => ({
  boards: [],
  columns: [],
  selectedTask: null,

  fetchBoards: async (workspaceId: string) => {
    const { data } = await client.get<Board[]>(`/api/boards/${workspaceId}`);
    set({ boards: data });
    return data;
  },

  fetchColumns: async (boardId: string) => {
    const { data } = await client.get<Column[]>(`/api/boards/${boardId}/columns`);
    set({ columns: data });
    return data;
  },

  setSelectedTask: (task) => set({ selectedTask: task }),

  updateTaskInColumn: (updatedTask: Task) => {
    set((s) => ({
      columns: s.columns.map(col => {
        if (col.id === updatedTask.column_id) {
          return {
            ...col,
            tasks: col.tasks.some(t => t.id === updatedTask.id)
              ? col.tasks.map(t => t.id === updatedTask.id ? updatedTask : t)
              : [...col.tasks, updatedTask]
          };
        }
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

  updateBoardName: (id: string, name: string) =>
    set(s => ({ boards: s.boards.map(b => b.id === id ? { ...b, name } : b) })),
}));

export default useBoardStore;
