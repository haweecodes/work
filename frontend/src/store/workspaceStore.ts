import { create } from 'zustand';
import client from '../api/client';
import type { Workspace, Channel, DmThread, Member } from '../types';

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  channels: Channel[];
  dmThreads: DmThread[];
  members: Member[];
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
  isInitialized: false,

  setCurrentWorkspace: async (workspace: Workspace) => {
    localStorage.setItem('fw_workspace', JSON.stringify(workspace));
    set({ currentWorkspace: workspace });
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
