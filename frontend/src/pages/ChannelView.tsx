import { useState, useEffect, useRef, useContext, useOptimistic, lazy, Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';
import useBoardStore from '../store/boardStore';
import useUIStore from '../store/uiStore';
import SocketContext from '../context/SocketContext';
import MessageBubble from '../components/MessageBubble';
import { MessageListSkeleton } from '../components/Skeleton';
import type { Message, Task, Reaction } from '../types';

// Heavy panels/modals — lazily loaded only when needed
const ThreadPanel = lazy(() => import('../components/ThreadPanel'));
const CreateTaskModal = lazy(() => import('../components/CreateTaskModal'));
const ShareModal = lazy(() => import('../components/ShareModal'));

export default function ChannelView() {
  const { channelId } = useParams<{ channelId: string }>();
  const { channels, currentWorkspace } = useWorkspaceStore();
  const { activeThreadId, setActiveThreadId, clearThreadUnread } = useUIStore();
  const clearChannelUnread = useUIStore(s => s.clearChannelUnread);
  const { user } = useAuthStore();
  const { boards, columns, fetchColumns } = useBoardStore();
  const socketRef = useContext(SocketContext);

  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [createTaskMsg, setCreateTaskMsg] = useState<Message | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [shareMsg, setShareMsg] = useState<Message | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const channel = channels.find(c => c.id === channelId);
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  // ── useOptimistic for messages ──────────────────────────────────────────────
  // Provides instant UI feedback when the user sends a message, before the
  // server confirms. On failure the optimistic state reverts automatically.
  const [optimisticMessages, addOptimistic] = useOptimistic(
    messages,
    (prev: Message[], optimisticMsg: Message) => [...prev, optimisticMsg],
  );

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => {
    if (!channelId) return;
    clearChannelUnread(channelId);
    setLoading(true);
    setMessages([]);

    const socket = socketRef?.current;

    // Named handlers so we can remove exactly these and not global listeners
    const handleNewMessage = (msg: Message) => {
      if (msg.channel_id !== channelId) return;
      if (msg.parent_message_id) {
        setMessages(prev => prev.map(m =>
          m.id === msg.parent_message_id
            ? { ...m, reply_count: (m.reply_count || 0) + 1 }
            : m
        ));
      } else {
        setMessages(prev => {
          // Deduplicate: skip if already present (optimistic echo)
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
      socket.on('new_message', handleNewMessage);
      socket.on('reaction_updated', handleReactionUpdated);
    }

    client.get<Message[]>(`/api/channels/messages/${channelId}`)
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
        socket.off('new_message', handleNewMessage);
        socket.off('reaction_updated', handleReactionUpdated);
      }
    };
  }, [channelId]);

  // ── Send message with optimistic update ─────────────────────────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;
    const text = content.trim();
    setContent('');

    // Create an optimistic message that looks like what we expect from the server
    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      channel_id: channelId,
      sender_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      sender: { id: user.id, name: user.name, avatar_url: user.avatar_url, email: user.email },
      reactions: [],
    };

    addOptimistic(optimistic);
    try {
      await client.post('/api/channels/messages', { channel_id: channelId, content: text });
    } catch {
      // On failure: revert by restoring content; optimistic state auto-reverts on re-render
      setContent(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as unknown as React.FormEvent); }
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

  const activeBoard = boards[0];

  const handleOpenCreateTask = async (msg: Message | null) => {
    setCreateTaskMsg(msg);
    if (activeBoard && columns.length === 0) await fetchColumns(activeBoard.id);
    setShowCreateTask(true);
  };

  const handleReply = (msg: Message) => {
    setActiveThreadId(msg.id);
    clearThreadUnread(msg.id);
  };

  const handleReactionToggle = (messageId: string, reactions: Reaction[]) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
  };

  const handleShare = (msg: Message) => setShareMsg(msg);

  const handleArchive = async () => {
    if (!channelId || !confirm('Are you sure you want to archive this channel?')) return;
    try {
      await client.patch(`/api/channels/${channelId}/archive`);
    } catch {
      alert('Failed to archive channel');
    }
  };

  const canArchive = user && !channel?.is_archived && (channel?.created_by === user.id || currentWorkspace?.owner_id === user.id);

  return (
    <div className="flex h-full bg-white relative">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-lg font-light">#</span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-gray-900">{channel?.name || 'Loading…'}</h1>
                {channel?.is_archived === 1 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500">Archived</span>
                )}
              </div>
              <p className="text-xs text-gray-400">{channel?.is_private ? 'Private channel' : 'Public channel'}</p>
            </div>
          </div>

          {canArchive && (
            <button onClick={handleArchive}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              Archive Channel
            </button>
          )}
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto py-4 space-y-0.5">
          {loading && <MessageListSkeleton count={7} />}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <span className="text-2xl">#</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Welcome to #{channel?.name}!</h3>
              <p className="text-sm text-gray-500">This is the beginning of the channel. Say hello! 👋</p>
            </div>
          )}

          {optimisticMessages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onCreateTask={handleOpenCreateTask}
              onReply={handleReply}
              onReactionToggle={handleReactionToggle}
              onShare={handleShare}
            />
          ))}
          <div ref={endRef} />
        </div>

        {/* Compose */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          {channel?.is_archived ? (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-gray-500 font-medium mb-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                This channel is archived
              </div>
              <p className="text-sm text-gray-400">You are viewing a read-only history. New messages cannot be sent.</p>
            </div>
          ) : (
            <form onSubmit={handleSend} className="flex items-center gap-3">
              <div className="flex-1 relative">
                <textarea
                  className="input resize-none pr-12 py-3 min-h-[44px] max-h-32"
                  placeholder={`Message #${channel?.name || ''}…`}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  style={{ height: 'auto', minHeight: '44px' }}
                  onInput={e => {
                    (e.target as HTMLTextAreaElement).style.height = 'auto';
                    (e.target as HTMLTextAreaElement).style.height = (e.target as HTMLTextAreaElement).scrollHeight + 'px';
                  }}
                />
                {activeBoard && (
                  <button type="button"
                    onClick={() => handleOpenCreateTask(null)}
                    className="absolute right-3 bottom-2.5 p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-primary-500 transition-colors"
                    title="Create task">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </button>
                )}
              </div>
              <button type="submit" className="btn-primary px-4 py-2.5 flex-shrink-0" disabled={!content.trim()}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Thread panel — lazily loaded */}
      {activeThreadId && (() => {
        const threadMsg = messages.find(m => m.id === activeThreadId)
          || (createTaskMsg?.id === activeThreadId ? createTaskMsg : null);
        if (!threadMsg) return null;
        return (
          <div className="w-96 flex-shrink-0 border-l border-gray-200 bg-white shadow-xl lg:shadow-none z-10 absolute lg:relative right-0 h-full">
            <Suspense fallback={<MessageListSkeleton count={4} />}>
              <ThreadPanel
                parentMessage={threadMsg}
                onClose={() => setActiveThreadId(null)}
                channelId={channelId!}
                onCreateTask={handleOpenCreateTask}
                onShare={handleShare}
              />
            </Suspense>
          </div>
        );
      })()}

      {/* Modals — lazily loaded */}
      {showCreateTask && activeBoard && (
        <Suspense fallback={null}>
          <CreateTaskModal
            prefilledMessage={createTaskMsg}
            boardId={activeBoard.id}
            onClose={handleCreateTask}
          />
        </Suspense>
      )}

      {shareMsg && (
        <Suspense fallback={null}>
          <ShareModal message={shareMsg} onClose={() => setShareMsg(null)} />
        </Suspense>
      )}
    </div>
  );
}
