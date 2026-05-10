import { useState, useEffect, useLayoutEffect, useRef, useContext } from 'react';
import client from '../api/client';
import SocketContext from '../context/SocketContext';
import type { Message, Reaction, Task, User } from '../types';

interface Config {
  type: 'channel' | 'dm';
  /** channelId or dmThreadId — undefined while still routing */
  id: string | undefined;
  user: User | null;
  endRef: React.RefObject<HTMLDivElement | null>;
  /** clearChannelUnread(id) or clearDmUnread(id) */
  onClearUnread: () => void;
  highlightId?: string | null;
}

export interface UseChatMessagesReturn {
  messages: Message[];
  loading: boolean;
  content: string;
  typingUsers: Record<string, string>;
  /** Expose so components can apply task-link / modal-close updates */
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  handleContentChange: (val: string) => void;
  handleSend: (e: React.SyntheticEvent) => Promise<void>;
  handleMsgUpdated: (msgId: string, newContent: string, editedAt?: string) => void;
  handleMsgDeleted: (msgId: string) => void;
  handleReactionToggle: (msgId: string, reactions: Reaction[]) => void;
  handleTaskLinked: (msgId: string, task: Task) => void;
}

const TYPING_STOP_DELAY = 3000;

export function useChatMessages({ type, id, user, endRef, onClearUnread, highlightId }: Config): UseChatMessagesReturn {
  const socketRef = useContext(SocketContext);

  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  // Timers for incoming typing indicator auto-clear
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Debounce timer for outgoing typing_stop
  const typingEmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Gate: only emit typing_start once per burst
  const isTypingActive = useRef(false);
  // The temp ID we're waiting to see in `messages` before scrolling
  const pendingScrollId = useRef<string | null>(null);

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });

  // Scroll instantly once the optimistic message lands in the DOM
  useLayoutEffect(() => {
    if (!pendingScrollId.current) return;
    if (messages.some((m: Message) => m.id === pendingScrollId.current)) {
      endRef.current?.scrollIntoView();
      pendingScrollId.current = null;
    }
  }, [messages]);

  // ── Socket listeners + initial fetch ──────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    onClearUnread();
    setLoading(true);
    setMessages([]);

    const socket = socketRef?.current;

    // DM rooms are joined explicitly; channels are joined by SocketContext on route change
    if (type === 'dm' && socket) socket.emit('join_dm', id);

    const msgEvent  = type === 'channel' ? 'new_message' : 'new_dm';
    const roomField = type === 'channel' ? 'channel_id'  : 'dm_thread_id';

    const handleNewMsg = (msg: Message) => {
      if ((msg as any)[roomField] !== id) return;
      if (msg.parent_message_id) {
        setMessages(prev => prev.map(m =>
          m.id === msg.parent_message_id ? { ...m, reply_count: (m.reply_count || 0) + 1 } : m
        ));
        return;
      }
      setMessages(prev => {
        // Swap our own temp message in-place — no position change, no jump
        const tempIdx = prev.findIndex(m =>
          m.id.startsWith('optimistic-') &&
          m.sender_id === msg.sender_id &&
          m.content === msg.content
        );
        if (tempIdx !== -1) {
          const next = [...prev];
          next[tempIdx] = msg;
          return next;
        }
        if (prev.some(m => m.id === msg.id)) return prev; // dedup
        return [...prev, msg];
      });
      setTimeout(scrollToBottom, 60);
    };

    const handleReactionUpdated = ({ messageId, reactions }: { messageId: string; reactions: Reaction[] }) =>
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));

    const handleMessageUpdated = ({ messageId, content: c, editedAt }: { messageId: string; content: string; editedAt?: string }) =>
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: c, edited_at: editedAt ?? new Date().toISOString() } : m));

    const handleMessageDeleted = ({ messageId }: { messageId: string }) =>
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted: true } : m));

    // Incoming typing events from other users
    const typingIdKey = type === 'channel' ? 'channelId' : 'dmThreadId';
    const handleUserTyping = (p: { userId: string; userName: string; channelId?: string; dmThreadId?: string }) => {
      if ((p as any)[typingIdKey] !== id) return;
      setTypingUsers(prev => ({ ...prev, [p.userId]: p.userName }));
      clearTimeout(typingTimers.current[p.userId]);
      typingTimers.current[p.userId] = setTimeout(() =>
        setTypingUsers(prev => { const next = { ...prev }; delete next[p.userId]; return next; }), 4000);
    };
    const handleUserStoppedTyping = (p: { userId: string; channelId?: string; dmThreadId?: string }) => {
      if ((p as any)[typingIdKey] !== id) return;
      clearTimeout(typingTimers.current[p.userId]);
      setTypingUsers(prev => { const next = { ...prev }; delete next[p.userId]; return next; });
    };

    if (socket) {
      socket.on(msgEvent,            handleNewMsg);
      socket.on('reaction_updated',  handleReactionUpdated);
      socket.on('message_updated',   handleMessageUpdated);
      socket.on('message_deleted',   handleMessageDeleted);
      socket.on('user_typing',       handleUserTyping);
      socket.on('user_stopped_typing', handleUserStoppedTyping);
    }

    const fetchUrl = type === 'channel' ? `/api/channels/messages/${id}` : `/api/dms/${id}`;
    client.get<Message[]>(fetchUrl)
      .then(({ data }) => {
        setMessages(data);
        setLoading(false);
        setTimeout(() => {
          if (highlightId) {
            const el = document.querySelector(`[data-msg-id="${highlightId}"]`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('msg-highlight');
              setTimeout(() => el.classList.remove('msg-highlight'), 3000);
              return;
            }
          }
          scrollToBottom();
        }, 60);
      })
      .catch(() => setLoading(false));

    return () => {
      if (socket) {
        socket.off(msgEvent,            handleNewMsg);
        socket.off('reaction_updated',  handleReactionUpdated);
        socket.off('message_updated',   handleMessageUpdated);
        socket.off('message_deleted',   handleMessageDeleted);
        socket.off('user_typing',       handleUserTyping);
        socket.off('user_stopped_typing', handleUserStoppedTyping);
      }
      Object.values(typingTimers.current).forEach(clearTimeout);
      typingTimers.current = {};
      setTypingUsers({});
      if (typingEmitTimer.current) clearTimeout(typingEmitTimer.current);
      isTypingActive.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type]);

  // ── Typing emit ───────────────────────────────────────────────────────────
  const emitTyping = (typing: boolean) => {
    const socket = socketRef?.current;
    if (!socket || !user || !id) return;
    const roomPayload = type === 'channel' ? { channelId: id } : { dmThreadId: id };
    socket.emit(typing ? 'typing_start' : 'typing_stop', { userId: user.id, userName: user.name, ...roomPayload });
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    if (val.trim()) {
      if (!isTypingActive.current) { isTypingActive.current = true; emitTyping(true); }
      if (typingEmitTimer.current) clearTimeout(typingEmitTimer.current);
      typingEmitTimer.current = setTimeout(() => { isTypingActive.current = false; emitTyping(false); }, TYPING_STOP_DELAY);
    } else if (isTypingActive.current) {
      isTypingActive.current = false;
      if (typingEmitTimer.current) clearTimeout(typingEmitTimer.current);
      emitTyping(false);
    }
  };

  // ── Optimistic send ───────────────────────────────────────────────────────
  const handleSend = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!content.trim() || !user || !id) return;
    const text = content.trim();
    setContent('');

    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      ...(type === 'channel' ? { channel_id: id } : { dm_thread_id: id }),
      sender_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      sender: { id: user.id, name: user.name, avatar_url: user.avatar_url, email: user.email },
      reactions: [],
    };

    pendingScrollId.current = optimistic.id;
    setMessages(prev => [...prev, optimistic]);

    const postUrl = type === 'channel' ? '/api/channels/messages' : `/api/dms/${id}`;
    const body    = type === 'channel' ? { channel_id: id, content: text } : { content: text };
    try {
      await client.post(postUrl, body);
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setContent(text);
    }
  };

  // ── Message-state helpers (passed as callbacks to MessageBubble / modals) ─
  const handleMsgUpdated = (msgId: string, newContent: string, editedAt?: string) =>
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: newContent, edited_at: editedAt ?? new Date().toISOString() } : m));

  const handleMsgDeleted = (msgId: string) =>
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted: true } : m));

  const handleReactionToggle = (msgId: string, reactions: Reaction[]) =>
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions } : m));

  const handleTaskLinked = (msgId: string, task: Task) =>
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, linked_task_id: task.id, linked_task: task } : m));

  return {
    messages, loading, content, typingUsers, setMessages,
    handleContentChange, handleSend,
    handleMsgUpdated, handleMsgDeleted, handleReactionToggle, handleTaskLinked,
  };
}
