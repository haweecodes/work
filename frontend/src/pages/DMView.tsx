import { useState, useEffect, useRef, useContext, useOptimistic, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';
import useUIStore from '../store/uiStore';
import useBoardStore from '../store/boardStore';
import SocketContext from '../context/SocketContext';
import MessageBubble from '../components/MessageBubble';
import { MessageListSkeleton } from '../components/Skeleton';
import type { Message, Task, Reaction } from '../types';

// Heavy panels/modals — lazily loaded
const ThreadPanel = lazy(() => import('../components/ThreadPanel'));
const ShareModal = lazy(() => import('../components/ShareModal'));
const CreateTaskModal = lazy(() => import('../components/CreateTaskModal'));

export default function DMView() {
  const { threadId } = useParams<{ threadId: string }>();
  const user = useAuthStore(s => s.user);
  const { dmThreads } = useWorkspaceStore();
  const { activeThreadId, setActiveThreadId, clearThreadUnread, clearDmUnread } = useUIStore();
  const { boards, columns, fetchColumns } = useBoardStore();
  const socketRef = useContext(SocketContext);

  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [shareMsg, setShareMsg] = useState<Message | null>(null);
  const [createTaskMsg, setCreateTaskMsg] = useState<Message | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const thread = dmThreads.find(t => t.id === threadId);
  const otherParticipants = thread?.participants?.filter(p => p.id !== user?.id) || [];
  const title = otherParticipants.map(p => p.name).join(', ') || 'Direct Message';
  const activeBoard = boards[0];

  // ── useOptimistic for instant send feedback ──────────────────────────────────
  const [optimisticMessages, addOptimistic] = useOptimistic(
    messages,
    (prev: Message[], msg: Message) => [...prev, msg],
  );

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => {
    if (!threadId) return;
    clearDmUnread(threadId);
    setLoading(true);
    setMessages([]);
    setActiveThreadId(null);

    const socket = socketRef?.current;

    const handleNewDm = (msg: Message) => {
      if (msg.dm_thread_id !== threadId) return;
      if (msg.parent_message_id) {
        setMessages(prev => prev.map(m =>
          m.id === msg.parent_message_id
            ? { ...m, reply_count: (m.reply_count || 0) + 1 }
            : m
        ));
      } else {
        setMessages(prev => {
          // Deduplicate (optimistic echo)
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setTimeout(scrollToBottom, 60);
      }
    };

    const handleReactionUpdated = ({ messageId, reactions }: { messageId: string; reactions: Reaction[] }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
    };

    if (socket) {
      socket.emit('join_dm', threadId);
      socket.on('new_dm', handleNewDm);
      socket.on('reaction_updated', handleReactionUpdated);
    }

    client.get<Message[]>(`/api/dms/${threadId}`)
      .then(({ data }) => {
        setMessages(data);
        setLoading(false);
        setTimeout(scrollToBottom, 60);
      })
      .catch(() => setLoading(false));

    return () => {
      if (socket) {
        socket.off('new_dm', handleNewDm);
        socket.off('reaction_updated', handleReactionUpdated);
      }
    };
  }, [threadId]);

  // ── Send with optimistic update ──────────────────────────────────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;
    const text = content.trim();
    setContent('');

    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      dm_thread_id: threadId,
      sender_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      sender: { id: user.id, name: user.name, avatar_url: user.avatar_url, email: user.email },
      reactions: [],
    };

    addOptimistic(optimistic);
    try {
      await client.post(`/api/dms/${threadId}`, { content: text });
    } catch {
      setContent(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as unknown as React.FormEvent); }
  };

  const handleReply = (msg: Message) => {
    setActiveThreadId(msg.id);
    clearThreadUnread(msg.id);
  };

  const handleShare = (msg: Message) => setShareMsg(msg);

  const handleReactionToggle = (messageId: string, reactions: Reaction[]) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
  };

  const handleOpenCreateTask = async (msg: Message | null) => {
    setCreateTaskMsg(msg);
    if (activeBoard && columns.length === 0) await fetchColumns(activeBoard.id);
    setShowCreateTask(true);
  };

  const handleCreateTask = (task: Task | null) => {
    if (task && createTaskMsg) {
      setMessages(prev => prev.map(m =>
        m.id === createTaskMsg.id ? { ...m, linked_task_id: task.id, linked_task: task } : m
      ));
    }
    setShowCreateTask(false);
    setCreateTaskMsg(null);
  };

  return (
    <div className="flex h-full bg-white relative">
      {/* Main DM view */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-3.5 border-b border-gray-200 flex-shrink-0">
          <div className="flex -space-x-1.5">
            {otherParticipants.slice(0, 2).map(p => (
              <img key={p.id} src={p.avatar_url} className="w-8 h-8 rounded-full border-2 border-white" alt={p.name} />
            ))}
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">{title}</h1>
            <p className="text-xs text-gray-400">Direct message</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 space-y-0.5">
          {loading && <MessageListSkeleton count={6} />}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="flex -space-x-2 mb-3">
                {otherParticipants.slice(0, 2).map(p => (
                  <img key={p.id} src={p.avatar_url} className="w-12 h-12 rounded-full border-2 border-white" alt={p.name} />
                ))}
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Start a conversation</h3>
              <p className="text-sm text-gray-500">
                This is the beginning of your DM with <strong>{title}</strong>.
              </p>
            </div>
          )}

          {optimisticMessages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onReply={handleReply}
              onShare={handleShare}
              onCreateTask={handleOpenCreateTask}
              onReactionToggle={handleReactionToggle}
            />
          ))}
          <div ref={endRef} />
        </div>

        {/* Compose */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <form onSubmit={handleSend} className="flex items-end gap-3">
            <textarea
              className="input flex-1 resize-none py-3 min-h-[44px] max-h-32"
              placeholder={`Message ${title}…`}
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              onInput={e => {
                (e.target as HTMLTextAreaElement).style.height = 'auto';
                (e.target as HTMLTextAreaElement).style.height = (e.target as HTMLTextAreaElement).scrollHeight + 'px';
              }}
            />
            <button type="submit" className="btn-primary px-4 py-2.5 flex-shrink-0" disabled={!content.trim()}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Thread panel — lazily loaded */}
      {activeThreadId && (() => {
        const threadMsg = messages.find(m => m.id === activeThreadId);
        if (!threadMsg) return null;
        return (
          <div className="w-96 flex-shrink-0 border-l border-gray-200 bg-white shadow-xl lg:shadow-none z-10 absolute lg:relative right-0 h-full">
            <Suspense fallback={<MessageListSkeleton count={4} />}>
              <ThreadPanel
                parentMessage={threadMsg}
                onClose={() => setActiveThreadId(null)}
                dmThreadId={threadId!}
                onCreateTask={handleOpenCreateTask}
                onShare={handleShare}
              />
            </Suspense>
          </div>
        );
      })()}

      {/* Share modal */}
      {shareMsg && (
        <Suspense fallback={null}>
          <ShareModal message={shareMsg} onClose={() => setShareMsg(null)} />
        </Suspense>
      )}

      {/* Create task modal */}
      {showCreateTask && activeBoard && (
        <Suspense fallback={null}>
          <CreateTaskModal
            prefilledMessage={createTaskMsg}
            boardId={activeBoard.id}
            onClose={handleCreateTask}
          />
        </Suspense>
      )}
    </div>
  );
}
