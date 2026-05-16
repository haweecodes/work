import { useState, useRef, lazy, Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';
import useUIStore from '../store/uiStore';
import useBoardStore from '../store/boardStore';
import { useChatMessages } from '../hooks/useChatMessages';
import MessageList from '../components/MessageList';
import MessageComposer from '../components/MessageComposer';
import PanelOverlay from '../components/PanelOverlay';
import TaskTray from '../components/TaskTray';
import { MessageListSkeleton } from '../components/Skeleton';
import type { Message, Task } from '../types';

const ThreadPanel     = lazy(() => import('../components/ThreadPanel'));
const TaskDetailPanel = lazy(() => import('../components/TaskDetailPanel'));
const ShareModal      = lazy(() => import('../components/ShareModal'));
const CreateTaskModal = lazy(() => import('../components/CreateTaskModal'));

export default function DMView() {
  const { threadId } = useParams<{ threadId: string }>();
  const user = useAuthStore(s => s.user);
  const { dmThreads, members } = useWorkspaceStore();
  const { activeThreadId, setActiveThreadId, clearThreadUnread, clearDmUnread } = useUIStore();
  const { boards, columns, fetchColumns, selectedTask, setSelectedTask } = useBoardStore();

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

  // ── Composer meta state ───────────────────────────────────────────────────
  const [importance, setImportance] = useState('normal');

  const handleSubmit = (e: React.SyntheticEvent) => {
    handleSend(e, { importance });
    setImportance('normal');
  };

  // ── DM-specific state ─────────────────────────────────────────────────────
  const [shareMsg, setShareMsg]           = useState<Message | null>(null);
  const [createTaskMsg, setCreateTaskMsg] = useState<Message | null>(null);
  const [createTaskPrefill, setCreateTaskPrefill] = useState<{ title?: string; priority?: string; due_date?: string } | undefined>(undefined);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showTaskPanel, setShowTaskPanel] = useState(false);

  const myTaskCount = columns.reduce((sum, c) => sum + c.tasks.filter(t => t.assignees?.some(a => a.id === user?.id)).length, 0);

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
        <div className="flex items-center justify-between flex-shrink-0"
          style={{ padding: '22px 40px 18px', borderBottom: '1px solid var(--rule)', background: 'var(--paper)' }}>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {otherParticipants.slice(0, 2).map(p => (
                <img key={p.id} src={p.avatar_url} className="w-7 h-7 rounded-full" style={{ border: '1px solid var(--paper)' }} alt={p.name} />
              ))}
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--ink)' }}>{title}</h1>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Direct message</p>
            </div>
          </div>
          <div className="flex items-baseline gap-6">
            <button
              onClick={() => { setShowTaskPanel(v => !v); }}
              style={{
                fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: showTaskPanel && !threadMsg ? 'var(--ink)' : 'var(--muted)',
                borderBottom: `1px solid ${showTaskPanel && !threadMsg ? 'var(--ink)' : 'transparent'}`,
                paddingBottom: 2, background: 'none',
              }}
              onMouseEnter={e => { if (!(showTaskPanel && !threadMsg)) e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={e => { if (!(showTaskPanel && !threadMsg)) e.currentTarget.style.color = 'var(--muted)'; }}
            >
              Tasks{myTaskCount > 0 ? ` · ${myTaskCount}` : ''}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-0" style={{ paddingTop: 22, paddingBottom: 8 }}>
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
        <div className="flex-shrink-0" style={{ padding: '18px 40px 26px', borderTop: '1px solid var(--rule)' }}>
          <MessageComposer value={content} onChange={handleContentChange} onSubmit={handleSubmit}
            placeholder={`Message ${title}…`} members={members}
            importance={importance} onImportanceChange={setImportance} />
        </div>
      </div>

      {/* Right panel — absolute overlay so messages never shift */}
      {(threadMsg || selectedTask || showTaskPanel) && (
        <PanelOverlay>
          {threadMsg ? (
            <Suspense fallback={<MessageListSkeleton count={4} />}>
              <ThreadPanel parentMessage={threadMsg} onClose={() => setActiveThreadId(null)}
                dmThreadId={threadId!} onCreateTask={handleOpenCreateTask} onShare={handleShare}
                onMessageUpdated={handleMsgUpdated} onMessageDeleted={handleMsgDeleted} />
            </Suspense>
          ) : selectedTask ? (
            <div className="flex flex-col h-full overflow-hidden">
              <Suspense fallback={<div className="animate-pulse p-5 space-y-3"><div className="h-4 bg-gray-100 rounded w-3/4" /></div>}>
                <TaskDetailPanel onBack={() => { setSelectedTask(null); setShowTaskPanel(true); }} />
              </Suspense>
            </div>
          ) : (
            <TaskTray columns={columns} userId={user?.id ?? ''} boardId={activeBoard?.id} onClose={() => setShowTaskPanel(false)} />
          )}
        </PanelOverlay>
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
