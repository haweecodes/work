import { create } from 'zustand';
import type { Message } from '../types';

export type SidebarView =
  | { type: 'notifications' }
  | { type: 'board-updates'; boardId: string; canRequest: boolean }
  | { type: 'thread'; message: Message; channelId?: string; dmThreadId?: string }
  | { type: 'tasks' }
  | null;

interface UIState {
  activeSidebar: SidebarView;
  openSidebar: (view: SidebarView) => void;
  closeSidebar: () => void;

  // Global ShareModal trigger
  shareMessage: Message | null;
  openShareModal: (msg: Message) => void;
  closeShareModal: () => void;

  showCreateBoard: boolean;
  showInvite: boolean;
  showSettings: boolean;
  channelUnread: Record<string, number>;
  dmUnread: Record<string, number>;
  threadUnread: Record<string, number>;
  openCreateBoard: () => void;
  closeCreateBoard: () => void;
  openInvite: () => void;
  closeInvite: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  incrementChannelUnread: (id: string) => void;
  incrementDmUnread: (id: string) => void;
  incrementThreadUnread: (id: string) => void;
  clearChannelUnread: (id: string) => void;
  clearDmUnread: (id: string) => void;
  clearThreadUnread: (id: string) => void;
}

const useUIStore = create<UIState>((set) => ({
  activeSidebar: null,
  openSidebar: (view) => set({ activeSidebar: view }),
  closeSidebar: () => set({ activeSidebar: null }),

  shareMessage: null,
  openShareModal: (msg) => set({ shareMessage: msg }),
  closeShareModal: () => set({ shareMessage: null }),

  showCreateBoard: false,
  showInvite: false,
  showSettings: false,
  channelUnread: {},
  dmUnread: {},
  threadUnread: {},
  openCreateBoard: () => set({ showCreateBoard: true }),
  closeCreateBoard: () => set({ showCreateBoard: false }),
  openInvite: () => set({ showInvite: true }),
  closeInvite: () => set({ showInvite: false }),
  openSettings: () => set({ showSettings: true }),
  closeSettings: () => set({ showSettings: false }),
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
