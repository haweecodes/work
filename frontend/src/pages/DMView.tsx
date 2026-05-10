import { useState, useRef, lazy, Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';
import useUIStore from '../store/uiStore';
import useBoardStore from '../store/boardStore';
import { useChatMessages } from '../hooks/useChatMessages';
import MessageList from '../components/MessageList';
import MessageComposer from '../components/MessageComposer';
import { MessageListSkeleton } from '../components/Skeleton';
import type { Message, Task } from '../types';

const ThreadPanel     = lazy(() => import('../components/ThreadPanel'));
const ShareModal      = lazy(() => import('../components/ShareModal'));
const CreateTaskModal = lazy(() => import('../components/CreateTaskModal'));

export default function DMView() {
  const { threadId } = useParams<{ threadId: string }>();
  const user = useAuthStore(s => s.user);
  const { dmThreads, members } = useWorkspaceStore();
  const { activeThreadId, setActiveThreadId, clearThreadUnread, clearDmUnread } = useUIStore();
  const { boards, columns, fetchColumns } = useBoardStore();

  const endRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();

  const thread = dmThreads.find(t => t.id === threadId);
  const otherParticipants = thread?.participants?.filter(p => p.id !== user?.id) || [];
  const title = otherParticipants.map(p => p.name).join(', ') || 'Direct Message';
  const activeBoard = boards[0];

  const {
    messages, loading, content, typingUsers, setMessages,
    handleContentChange, handleSend,
    handleMsgUpdated, handleMsgDeleted, handleReactionToggle, handleTaskLinked,
  } = useChatMessages({
    type: 'dm',
    id: threadId,
    user,
    endRef,
    onClearUnread: () => { threadId && clearDmUnread(threadId); setActiveThreadId(null); },
    highlightId: searchParams.get('highlight'),
  });

  // ── DM-specific state ─────────────────────────────────────────────────────
  const [shareMsg, setShareMsg]           = useState<Message | null>(null);
  const [createTaskMsg, setCreateTaskMsg] = useState<Message | null>(null);
  const [createTaskPrefill, setCreateTaskPrefill] = useState<{ title?: string; priority?: string; due_date?: string } | undefined>(undefined);
  const [showCreateTask, setShowCreateTask] = useState(false);

  const handleReply = (msg: Message) => { setActiveThreadId(msg.id); clearThreadUnread(msg.id); };
  const handleShare = (msg: Message) => setShareMsg(msg);

  const handleOpenCreateTask = async (msg: Message | null, prefill?: { title: string; priority: string; dueDate: string }) => {
    setCreateTaskMsg(msg);
    setCreateTaskPrefill(prefill ? { title: prefill.title, priority: prefill.priority, due_date: prefill.dueDate } : undefined);
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
    setCreateTaskPrefill(undefined);
  };

  const threadMsg = activeThreadId ? messages.find(m => m.id === activeThreadId) : null;

  return (
    <div className="flex h-full relative">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-3.5 border-b border-gray-200 flex-shrink-0 bg-white">
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
              <p className="text-sm text-gray-500">This is the beginning of your DM with <strong>{title}</strong>.</p>
            </div>
          )}
          <MessageList
            messages={messages}
            typingUsers={typingUsers}
            onCreateTask={handleOpenCreateTask}
            onTaskLinked={handleTaskLinked}
            onMessageUpdated={handleMsgUpdated}
            onMessageDeleted={handleMsgDeleted}
            onReply={handleReply}
            onReactionToggle={handleReactionToggle}
            onShare={handleShare}
          />
          <div ref={endRef} />
        </div>

        {/* Compose */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <MessageComposer value={content} onChange={handleContentChange} onSubmit={handleSend}
            placeholder={`Message ${title}…`} members={members} />
        </div>
      </div>

      {/* Thread panel */}
      {threadMsg && (
        <div className="w-96 flex-shrink-0 border-l border-gray-200 bg-white shadow-xl lg:shadow-none z-10 absolute lg:relative right-0 h-full">
          <Suspense fallback={<MessageListSkeleton count={4} />}>
            <ThreadPanel parentMessage={threadMsg} onClose={() => setActiveThreadId(null)}
              dmThreadId={threadId!} onCreateTask={handleOpenCreateTask} onShare={handleShare}
              onMessageUpdated={handleMsgUpdated} onMessageDeleted={handleMsgDeleted} />
          </Suspense>
        </div>
      )}

      {shareMsg && (
        <Suspense fallback={null}>
          <ShareModal message={shareMsg} onClose={() => setShareMsg(null)} />
        </Suspense>
      )}
      {showCreateTask && activeBoard && (
        <Suspense fallback={null}>
          <CreateTaskModal prefilledMessage={createTaskMsg} prefilledData={createTaskPrefill}
            boardId={activeBoard.id} onClose={handleCreateTask} />
        </Suspense>
      )}
    </div>
  );
}
