import { useState, useEffect, useLayoutEffect, useRef, useContext } from 'react';
import client from '../api/client';
import SocketContext from '../context/SocketContext';
import type { Message, MentionPriority, Reaction, Task, User } from '../types';

interface Config {
  type: 'channel' | 'dm';
  /** channelId or dmThreadId — undefined while still routing */
  id: string | undefined;
  user: User | null;
  endRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** clearChannelUnread(id) or clearDmUnread(id) */
  onClearUnread: () => void;
  highlightId?: string | null;
}

export interface UseChatMessagesReturn {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  content: string;
  typingUsers: Record<string, string>;
  /** Expose so components can apply task-link / modal-close updates */
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  handleContentChange: (val: string) => void;
  handleSend: (e: React.SyntheticEvent, meta?: { importance?: string; mentionPriorities?: MentionPriority[] }) => Promise<void>;
  handleMsgUpdated: (msgId: string, newContent: string, editedAt?: string) => void;
  handleMsgDeleted: (msgId: string) => void;
  handleReactionToggle: (msgId: string, reactions: Reaction[]) => void;
  handleTaskLinked: (msgId: string, task: Task) => void;
  loadMore: () => Promise<void>;
}

const TYPING_STOP_DELAY = 3000;

export function useChatMessages({ type, id, user, endRef, scrollRef, onClearUnread, highlightId }: Config): UseChatMessagesReturn {
  const socketRef = useContext(SocketContext);

  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const oldestTimestamp = useRef<string | null>(null);
  const scrollRestoreRef = useRef<{ heightBefore: number; topBefore: number } | null>(null);
  // Refs so the scroll listener always sees current values without stale closures
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const loadMoreRef = useRef<(() => Promise<void>) | null>(null);
  hasMoreRef.current = hasMore;
  loadingMoreRef.current = loadingMore;

  // Timers for incoming typing indicator auto-clear
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Debounce timer for outgoing typing_stop
  const typingEmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Gate: only emit typing_start once per burst
  const isTypingActive = useRef(false);
  // The temp ID we're waiting to see in `messages` before scrolling
  const pendingScrollId = useRef<string | null>(null);
  // Set to true before setMessages on initial load so useLayoutEffect can jump to bottom
  const shouldScrollToBottom = useRef(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const sc = scrollRef.current;
    if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior });
  };

  // Jump to bottom on initial load — instant, no animation (new channel/DM navigation)
  useLayoutEffect(() => {
    if (!shouldScrollToBottom.current) return;
    shouldScrollToBottom.current = false;
    const sc = scrollRef.current;
    if (sc) sc.scrollTop = sc.scrollHeight;
  }, [messages]);

  // Smooth-scroll once the optimistic message lands in the DOM
  useLayoutEffect(() => {
    if (!pendingScrollId.current) return;
    if (messages.some((m: Message) => m.id === pendingScrollId.current)) {
      scrollToBottom('smooth');
      pendingScrollId.current = null;
    }
  }, [messages]);

  // Restore scroll position after prepending older messages
  useLayoutEffect(() => {
    const target = scrollRestoreRef.current;
    const sc = scrollRef.current;
    if (!target || !sc) return;
    sc.scrollTop = target.topBefore + (sc.scrollHeight - target.heightBefore);
    scrollRestoreRef.current = null;
  }, [messages]);

  // ── Socket listeners + initial fetch ──────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    onClearUnread();
    setLoading(true);
    setMessages([]);
    setHasMore(false);
    setLoadingMore(false);
    oldestTimestamp.current = null;
    scrollRestoreRef.current = null;

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
          const optimistic = prev[tempIdx];
          const next = [...prev];
          next[tempIdx] = {
            ...msg,
            // Preserve importance/mention_priorities from optimistic if server doesn't echo them yet
            importance: msg.importance ?? optimistic.importance,
            mention_priorities: msg.mention_priorities ?? optimistic.mention_priorities,
          };
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
    client.get<{ messages: Message[]; hasMore: boolean }>(`${fetchUrl}?limit=50`)
      .then(({ data }) => {
        // Backend returns DESC (newest first) — reverse for display (oldest at top)
        const ordered = [...data.messages].reverse();
        oldestTimestamp.current = data.messages[data.messages.length - 1]?.created_at ?? null;
        if (!highlightId) {
          // Flag useLayoutEffect to jump to bottom after this render
          shouldScrollToBottom.current = true;
        }
        setMessages(ordered);
        setHasMore(data.hasMore);
        setLoading(false);
        if (highlightId) {
          // Highlight needs a tick after render to find the element by data attribute
          setTimeout(() => {
            const el = document.querySelector(`[data-msg-id="${highlightId}"]`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('msg-highlight');
              setTimeout(() => el.classList.remove('msg-highlight'), 3000);
            } else {
              scrollToBottom('smooth');
            }
          }, 80);
        }
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

  // ── Scroll-to-top listener triggers loadMore ─────────────────────────────
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const handleScroll = () => {
      if (sc.scrollTop < 150 && hasMoreRef.current && !loadingMoreRef.current) {
        loadMoreRef.current?.();
      }
    };
    sc.addEventListener('scroll', handleScroll, { passive: true });
    return () => sc.removeEventListener('scroll', handleScroll);
  // Re-attach whenever the scroll container itself could change (id/type change)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type]);

  // ── Load older messages ───────────────────────────────────────────────────
  const loadMore = async () => {
    if (!hasMoreRef.current || loadingMoreRef.current || !id || !oldestTimestamp.current) return;
    setLoadingMore(true);
    const sc = scrollRef.current;
    scrollRestoreRef.current = { heightBefore: sc?.scrollHeight ?? 0, topBefore: sc?.scrollTop ?? 0 };
    try {
      const fetchUrl = type === 'channel' ? `/api/channels/messages/${id}` : `/api/dms/${id}`;
      const { data } = await client.get<{ messages: Message[]; hasMore: boolean }>(
        `${fetchUrl}?limit=50&before=${encodeURIComponent(oldestTimestamp.current)}`
      );
      const older = [...data.messages].reverse();
      oldestTimestamp.current = data.messages[data.messages.length - 1]?.created_at ?? oldestTimestamp.current;
      setHasMore(data.hasMore);
      setMessages(prev => [...older, ...prev]);
    } finally {
      setLoadingMore(false);
    }
  };
  loadMoreRef.current = loadMore;

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
  const handleSend = async (e: React.SyntheticEvent, meta?: { importance?: string; mentionPriorities?: MentionPriority[] }) => {
    e.preventDefault();
    if (!content.trim() || !user || !id) return;
    const text = content.trim();
    const importance = meta?.importance || 'normal';
    const mentionPriorities = meta?.mentionPriorities ?? [];
    setContent('');

    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      ...(type === 'channel' ? { channel_id: id } : { dm_thread_id: id }),
      sender_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      sender: { id: user.id, name: user.name, avatar_url: user.avatar_url, email: user.email },
      reactions: [],
      importance,
      mention_priorities: mentionPriorities,
    };

    pendingScrollId.current = optimistic.id;
    setMessages(prev => [...prev, optimistic]);

    const postUrl = type === 'channel' ? '/api/channels/messages' : `/api/dms/${id}`;
    const body = type === 'channel'
      ? { channel_id: id, content: text, importance, mention_priorities: mentionPriorities }
      : { content: text, importance };
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
    messages, loading, hasMore, loadingMore, content, typingUsers, setMessages,
    handleContentChange, handleSend,
    handleMsgUpdated, handleMsgDeleted, handleReactionToggle, handleTaskLinked,
    loadMore,
  };
}
