import { create } from 'zustand';
import client from '../api/client';
import type { Board, BoardMember, Column, Task } from '../types';

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
  updateBoardTeam: (id: string, teamId: string | null) => void;
  updateBoardChannel: (id: string, channelId: string | null) => void;
  fetchBoardMembers: (boardId: string) => Promise<BoardMember[]>;
  addBoardMember: (boardId: string, userId: string) => Promise<void>;
  removeBoardMember: (boardId: string, userId: string) => Promise<void>;
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

  updateBoardTeam: (id: string, teamId: string | null) =>
    set(s => ({ boards: s.boards.map(b => b.id === id ? { ...b, team_id: teamId } : b) })),

  updateBoardChannel: (id: string, channelId: string | null) =>
    set(s => ({ boards: s.boards.map(b => b.id === id ? { ...b, channel_id: channelId } : b) })),

  fetchBoardMembers: async (boardId: string) => {
    const { data } = await client.get<BoardMember[]>(`/api/boards/${boardId}/members`);
    set(s => ({ boards: s.boards.map(b => b.id === boardId ? { ...b, members: data } : b) }));
    return data;
  },

  addBoardMember: async (boardId: string, userId: string) => {
    await client.post(`/api/boards/${boardId}/members`, { user_id: userId });
  },

  removeBoardMember: async (boardId: string, userId: string) => {
    await client.delete(`/api/boards/${boardId}/members/${userId}`);
    set(s => ({
      boards: s.boards.map(b =>
        b.id === boardId
          ? { ...b, members: (b.members ?? []).filter(m => m.id !== userId) }
          : b
      ),
    }));
  },
}));

export default useBoardStore;
