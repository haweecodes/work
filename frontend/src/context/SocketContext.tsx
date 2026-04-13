import { createContext, useEffect, useRef, type ReactNode, type MutableRefObject } from 'react';
import { io, type Socket } from 'socket.io-client';
import useAuthStore from '../store/authStore';
import useNotificationStore from '../store/notificationStore';
import useBoardStore from '../store/boardStore';
import useWorkspaceStore from '../store/workspaceStore';
import useUIStore from '../store/uiStore';
import type { Notification, Task, Message } from '../types';

const SocketContext = createContext<MutableRefObject<Socket | null> | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const user = useAuthStore(s => s.user);
  const addNotification = useNotificationStore(s => s.addNotification);
  const updateTaskInColumn = useBoardStore(s => s.updateTaskInColumn);
  const removeTask = useBoardStore(s => s.removeTask);
  const channels = useWorkspaceStore(s => s.channels);
  const dmThreads = useWorkspaceStore(s => s.dmThreads);

  // Track which rooms we currently have joined so we can leave them before joining new ones.
  // This prevents stale events from a previous workspace's channels/DMs from bleeding through.
  const joinedRoomsRef = useRef<{ channels: string[]; dms: string[] }>({ channels: [], dms: [] });

  // Initialize socket and global event handlers
  useEffect(() => {
    if (!user) return;

    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_user', user.id);
    });

    socket.on('notification', (notif: Notification) => {
      addNotification(notif);
    });

    socket.on('member_joined', (member: any) => {
      useWorkspaceStore.getState().addMember(member);
    });

    socket.on('task_updated', ({ type, task, task_id }: { type: string; task: Task; task_id: string }) => {
      // Guard: only apply if this task belongs to a board in the current workspace
      const { boards } = useBoardStore.getState();
      const boardExists = type === 'deleted'
        ? boards.some(b => b.id === task?.board_id)  // task may be undefined for delete
        : boards.some(b => b.id === task?.board_id);

      if (type === 'deleted') {
        // For delete, we check boards if task carries board_id, otherwise allow it
        // (the board may have been unloaded already)
        removeTask(task_id);
      } else if (boardExists) {
        updateTaskInColumn(task);
      }
    });

    // Increment unread counts for messages received outside the active view
    socket.on('new_message', (msg: Message) => {
      const activePath = window.location.pathname;
      const { activeThreadId, incrementThreadUnread, incrementChannelUnread } = useUIStore.getState();

      // Guard: only count unread for channels that belong to the current workspace
      const { channels: currentChannels } = useWorkspaceStore.getState();
      if (msg.channel_id && !currentChannels.some(c => c.id === msg.channel_id)) return;

      if (msg.parent_message_id) {
        if (activeThreadId !== msg.parent_message_id) incrementThreadUnread(msg.parent_message_id);
      } else if (msg.channel_id && !activePath.includes(`/channel/${msg.channel_id}`)) {
        incrementChannelUnread(msg.channel_id);
      }
    });

    socket.on('new_dm', (msg: Message) => {
      const activePath = window.location.pathname;

      // Guard: only count unread for DM threads in the current workspace
      const { dmThreads: currentDms } = useWorkspaceStore.getState();
      if (msg.dm_thread_id && !currentDms.some(t => t.id === msg.dm_thread_id)) return;

      if (msg.dm_thread_id && !activePath.includes(`/dm/${msg.dm_thread_id}`)) {
        useUIStore.getState().incrementDmUnread(msg.dm_thread_id);
      }
    });

    socket.on('channel_created', (channel: any) => {
      const { channels, addChannel } = useWorkspaceStore.getState();
      if (!channels.some(c => c.id === channel.id)) {
        addChannel(channel);
      }
    });

    socket.on('channel_archived', ({ channelId }: { channelId: string }) => {
      useWorkspaceStore.getState().updateChannel({ id: channelId, is_archived: 1 });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      joinedRoomsRef.current = { channels: [], dms: [] };
    };
  }, [user?.id]);

  // Leave old rooms, then join all current workspace's channel and DM rooms.
  // Re-runs whenever the channel/thread list changes (e.g. on workspace switch).
  // This ensures events from previous workspace rooms stop arriving after a switch.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const doSwitch = () => {
      // Leave rooms from the previous workspace
      joinedRoomsRef.current.channels.forEach(id => socket.emit('leave_channel', id));
      joinedRoomsRef.current.dms.forEach(id => socket.emit('leave_dm', id));

      // Join rooms for the current workspace
      const chIds = channels.map(c => c.id);
      const dmIds = dmThreads.map(t => t.id);
      chIds.forEach(id => socket.emit('join_channel', id));
      dmIds.forEach(id => socket.emit('join_dm', id));

      // Track so next switch can leave these
      joinedRoomsRef.current = { channels: chIds, dms: dmIds };
    };

    if (socket.connected) {
      doSwitch();
    } else {
      socket.once('connect', doSwitch);
    }
  }, [channels, dmThreads]);

  return (
    <SocketContext.Provider value={socketRef}>
      {children}
    </SocketContext.Provider>
  );
}

export default SocketContext;
