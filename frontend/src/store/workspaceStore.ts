import { create } from 'zustand';
import client from '../api/client';
import type { Workspace, Channel, DmThread, Member } from '../types';


interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  channels: Channel[];
  dmThreads: DmThread[];
  members: Member[];
  /** The current user's role in the active workspace ('admin' | 'member' | null) */
  role: 'admin' | 'member' | null;
  /** True if the user is admin OR the workspace owner */
  isAdmin: (userId: string) => boolean;
  isInitialized: boolean;
  setCurrentWorkspace: (workspace: Workspace) => Promise<void>;
  fetchWorkspaces: () => Promise<Workspace[]>;
  fetchChannels: (workspaceId: string) => Promise<void>;
  fetchMembers: (workspaceId: string) => Promise<void>;
  fetchDmThreads: (workspaceId: string) => Promise<void>;
  addChannel: (channel: Channel) => void;
  updateChannel: (channel: Partial<Channel> & { id: string }) => void;
  addDmThread: (thread: DmThread) => void;
  updateDmThread: (thread: DmThread) => void;
  addMember: (member: Member) => void;
}

const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  currentWorkspace: JSON.parse(localStorage.getItem('fw_workspace') || 'null') as Workspace | null,
  channels: [],
  dmThreads: [],
  members: [],
  role: null,
  isAdmin: (userId: string) => {
    const s = get();
    return s.role === 'admin' || s.currentWorkspace?.owner_id === userId;
  },

  isInitialized: false,

  setCurrentWorkspace: async (workspace: Workspace) => {
    // ── Reset all workspace-scoped state before loading the new one ──────────
    // Import stores lazily to avoid circular deps
    const { default: useBoardStore }  = await import('./boardStore');
    const { default: useUIStore }     = await import('./uiStore');
    const { default: useNotifStore }  = await import('./notificationStore');

    // Clear board / task drawer
    useBoardStore.setState({ columns: [], boards: [], selectedTask: null });

    // Clear open thread, unread counts, and any open modals
    useUIStore.setState({
      activeThreadId: null,
      channelUnread: {},
      dmUnread: {},
      threadUnread: {},
      showCreateBoard: false,
      showInvite: false,
    });

    // Clear notifications (will be re-fetched by AppLayout)
    useNotifStore.setState({ notifications: [] });

    // Reset role until the new workspace's members are loaded
    set({ role: null });

    // Switch workspace and load its data
    localStorage.setItem('fw_workspace', JSON.stringify(workspace));
    set({ currentWorkspace: workspace, channels: [], dmThreads: [], members: [] });
    await get().fetchChannels(workspace.id);
    await get().fetchMembers(workspace.id);
    await get().fetchDmThreads(workspace.id);
  },


  fetchWorkspaces: async () => {
    const { data } = await client.get<Workspace[]>('/api/workspaces');
    set({ workspaces: data });
    return data;
  },

  fetchChannels: async (workspaceId: string) => {
    const { data } = await client.get<Channel[]>(`/api/channels/${workspaceId}`);
    set({ channels: data });
  },

  fetchMembers: async (workspaceId: string) => {
    const { data } = await client.get<Member[]>(`/api/workspaces/${workspaceId}/members`);
    set({ members: data });
    // Derive the current user's role in this workspace
    const { default: useAuthStore } = await import('./authStore');
    const userId = useAuthStore.getState().user?.id;
    if (userId) {
      const me = data.find(m => m.id === userId);
      set({ role: (me?.role ?? 'member') as 'admin' | 'member' });
    }
  },

  fetchDmThreads: async (workspaceId: string) => {
    const { data } = await client.get<DmThread[]>(`/api/dms/threads/${workspaceId}`);
    set({ dmThreads: data });
  },

  addChannel: (channel: Channel) => set((s) => {
    if (s.channels.some(c => c.id === channel.id)) return s;
    return { channels: [...s.channels, channel] };
  }),
  updateChannel: (channel) => set((s) => ({
    channels: s.channels.map(c => c.id === channel.id ? { ...c, ...channel } : c)
  })),
  addDmThread: (thread: DmThread) => set((s) => ({ dmThreads: [...s.dmThreads, thread] })),
  updateDmThread: (thread: DmThread) => set((s) => ({
    dmThreads: s.dmThreads.map(t => t.id === thread.id ? { ...t, ...thread } : t)
  })),
  addMember: (member: Member) => set((s) => {
    if (s.members.some(m => m.id === member.id)) return s;
    return { members: [...s.members, member] };
  }),
}));

export default useWorkspaceStore;
