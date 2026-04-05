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
      if (type === 'deleted') removeTask(task_id);
      else updateTaskInColumn(task);
    });

    // Increment unread counts for messages received outside the active view
    socket.on('new_message', (msg: Message) => {
      const activePath = window.location.pathname;
      const { activeThreadId, incrementThreadUnread, incrementChannelUnread } = useUIStore.getState();

      if (msg.parent_message_id) {
        if (activeThreadId !== msg.parent_message_id) incrementThreadUnread(msg.parent_message_id);
      } else if (msg.channel_id && !activePath.includes(`/channel/${msg.channel_id}`)) {
        incrementChannelUnread(msg.channel_id);
      }
    });

    socket.on('new_dm', (msg: Message) => {
      const activePath = window.location.pathname;
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
    };
  }, [user?.id]);

  // Join ALL channel and DM rooms so the global listeners above receive
  // events from every conversation, not just the currently active one.
  // This re-runs whenever the channel/thread list changes (e.g. on workspace switch).
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const doJoin = () => {
      channels.forEach(ch => socket.emit('join_channel', ch.id));
      dmThreads.forEach(t => socket.emit('join_dm', t.id));
    };

    if (socket.connected) {
      doJoin();
    } else {
      socket.once('connect', doJoin);
    }
  }, [channels, dmThreads]);

  return (
    <SocketContext.Provider value={socketRef}>
      {children}
    </SocketContext.Provider>
  );
}

export default SocketContext;
