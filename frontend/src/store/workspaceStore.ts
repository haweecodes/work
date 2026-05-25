import { create } from 'zustand';
import client from '../api/client';
import type { Workspace, Channel, DmThread, Member, StatusConfig } from '../types';

const DEFAULT_STATUSES: StatusConfig[] = [
  { value: 'on_track',  label: 'On Track',   color: 'var(--ink)',    requiresReason: false },
  { value: 'delayed',   label: 'Delayed',     color: '#C47B2A',      requiresReason: true  },
  { value: 'finished',  label: 'Finished',    color: 'var(--ink)',   requiresReason: false },
  { value: 'cancelled', label: 'Cancelled',   color: 'var(--faint)', requiresReason: false },
];

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  channels: Channel[];
  dmThreads: DmThread[];
  members: Member[];
  taskUpdateStatuses: StatusConfig[];
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
  fetchSettings: (workspaceId: string) => Promise<void>;
  setTaskUpdateStatuses: (statuses: StatusConfig[]) => void;
  addChannel: (channel: Channel) => void;
  updateChannel: (channel: Partial<Channel> & { id: string }) => void;
  addDmThread: (thread: DmThread) => void;
  updateDmThread: (thread: DmThread) => void;
  addMember: (member: Member) => void;
  updateMemberStatus: (userId: string, status_emoji: string | null, status_text: string | null) => void;
}

const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  currentWorkspace: JSON.parse(localStorage.getItem('fw_workspace') || 'null') as Workspace | null,
  channels: [],
  dmThreads: [],
  members: [],
  taskUpdateStatuses: DEFAULT_STATUSES,
  role: null,
  isAdmin: (userId: string) => {
    const s = get();
    return s.role === 'admin' || s.currentWorkspace?.owner_id === userId;
  },

  isInitialized: false,

  setCurrentWorkspace: async (workspace: Workspace) => {
    const { default: useBoardStore }  = await import('./boardStore');
    const { default: useUIStore }     = await import('./uiStore');
    const { default: useNotifStore }  = await import('./notificationStore');

    useBoardStore.setState({ columns: [], boards: [], selectedTask: null });
    useUIStore.setState({
      activeSidebar: null,
      channelUnread: {},
      dmUnread: {},
      threadUnread: {},
      showCreateBoard: false,
      showInvite: false,
    });
    useNotifStore.setState({ notifications: [] });
    set({ role: null, taskUpdateStatuses: DEFAULT_STATUSES });

    localStorage.setItem('fw_workspace', JSON.stringify(workspace));
    set({ currentWorkspace: workspace, channels: [], dmThreads: [], members: [] });
    await get().fetchChannels(workspace.id);
    await get().fetchMembers(workspace.id);
    await get().fetchDmThreads(workspace.id);
    await get().fetchSettings(workspace.id);
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

  fetchSettings: async (workspaceId: string) => {
    try {
      const { data } = await client.get<{ task_update_statuses: StatusConfig[] }>(
        `/api/workspaces/${workspaceId}/settings`
      );
      if (data.task_update_statuses?.length > 0) {
        set({ taskUpdateStatuses: data.task_update_statuses });
      }
    } catch { /* keep defaults on error */ }
  },

  setTaskUpdateStatuses: (statuses) => set({ taskUpdateStatuses: statuses }),

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
  updateMemberStatus: (userId, status_emoji, status_text) => set((s) => ({
    members: s.members.map(m => m.id === userId ? { ...m, status_emoji, status_text } : m),
  })),
}));

export default useWorkspaceStore;
