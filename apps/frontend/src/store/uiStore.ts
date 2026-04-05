import { create } from 'zustand';

interface UIState {
  showCreateBoard: boolean;
  showInvite: boolean;
  channelUnread: Record<string, number>;
  dmUnread: Record<string, number>;
  threadUnread: Record<string, number>;
  activeThreadId: string | null;
  openCreateBoard: () => void;
  closeCreateBoard: () => void;
  openInvite: () => void;
  closeInvite: () => void;
  setActiveThreadId: (id: string | null) => void;
  incrementChannelUnread: (id: string) => void;
  incrementDmUnread: (id: string) => void;
  incrementThreadUnread: (id: string) => void;
  clearChannelUnread: (id: string) => void;
  clearDmUnread: (id: string) => void;
  clearThreadUnread: (id: string) => void;
}

const useUIStore = create<UIState>((set) => ({
  showCreateBoard: false,
  showInvite: false,
  channelUnread: {},
  dmUnread: {},
  threadUnread: {},
  activeThreadId: null,
  openCreateBoard: () => set({ showCreateBoard: true }),
  closeCreateBoard: () => set({ showCreateBoard: false }),
  openInvite: () => set({ showInvite: true }),
  closeInvite: () => set({ showInvite: false }),
  setActiveThreadId: (id) => set({ activeThreadId: id }),
  incrementChannelUnread: (id) =>
    set((s) => ({ channelUnread: { ...s.channelUnread, [id]: (s.channelUnread[id] || 0) + 1 } })),
  incrementDmUnread: (id) =>
    set((s) => ({ dmUnread: { ...s.dmUnread, [id]: (s.dmUnread[id] || 0) + 1 } })),
  incrementThreadUnread: (id) =>
    set((s) => ({ threadUnread: { ...s.threadUnread, [id]: (s.threadUnread[id] || 0) + 1 } })),
  clearChannelUnread: (id) =>
    set((s) => ({ channelUnread: { ...s.channelUnread, [id]: 0 } })),
  clearDmUnread: (id) =>
    set((s) => ({ dmUnread: { ...s.dmUnread, [id]: 0 } })),
  clearThreadUnread: (id) =>
    set((s) => ({ threadUnread: { ...s.threadUnread, [id]: 0 } })),
}));

export default useUIStore;
