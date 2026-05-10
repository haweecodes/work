import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';
import useBoardStore from '../store/boardStore';
import useUIStore from '../store/uiStore';
import { useChatMessages } from '../hooks/useChatMessages';
import MessageList from '../components/MessageList';
import MessageComposer from '../components/MessageComposer';
import { MessageListSkeleton } from '../components/Skeleton';
import type { Message, Task, Column } from '../types';

// ── Pipeline mock data (no backend integration yet) ───────────────────────────
interface PipelineDeal {
  id: string; company: string; detail: string;
  value: string; prob: string;
  stage: 'lead' | 'qualified' | 'proposal' | 'closing';
}
const PIPELINE_STAGES: { id: PipelineDeal['stage']; label: string; color: string }[] = [
  { id: 'lead',      label: 'Lead',      color: '#9CA3AF' },
  { id: 'qualified', label: 'Qualified', color: '#0D9488' },
  { id: 'proposal',  label: 'Proposal',  color: '#7C3AED' },
  { id: 'closing',   label: 'Closing',   color: '#D97706' },
];
const INITIAL_PIPELINE: PipelineDeal[] = [
  { id: 'p1', company: 'Acme Corp',        detail: 'Enterprise Plan · 450 seats', value: '$84,000', prob: '72% close probability', stage: 'proposal' },
  { id: 'p2', company: 'Bright Solutions', detail: 'Growth Plan · 80 seats',      value: '$12,400', prob: '55% close probability', stage: 'qualified' },
  { id: 'p3', company: 'Meridian Labs',    detail: 'Starter Plan · 25 seats',     value: '$3,600',  prob: '90% close probability', stage: 'closing' },
];

// ── Mini-Kanban panel ─────────────────────────────────────────────────────────
function KanbanPanel({ columns }: { columns: Column[] }) {
  const { setSelectedTask } = useBoardStore();
  const getColor = (t: string) =>
    /to.?do|todo|backlog/i.test(t) ? '#7C3AED' :
    /progress|doing|active/i.test(t) ? '#D97706' :
    /done|complete|shipped/i.test(t) ? '#0D9488' : '#7C3AED';

  return (
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3" style={{ scrollbarWidth: 'thin' }}>
      {columns.map(col => (
        <div key={col.id}>
          <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: getColor(col.title) }}>{col.title}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#E5E7EB', color: '#9CA3AF' }}>{col.tasks.length}</span>
          </div>
          {col.tasks.map(task => (
            <div key={task.id} className="rounded-lg p-2.5 mb-1.5 cursor-pointer transition-all"
              style={{ background: '#F8F9FC', border: '1px solid #E5E7EB', borderLeft: `3px solid ${getColor(col.title)}` }}
              onClick={() => setSelectedTask(task)}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div className="text-[13px] font-medium text-gray-900 mb-1.5 leading-snug">{task.title}</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {task.priority && (
                  <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full" style={
                    task.priority === 'high'   ? { background: '#FEE2E2', color: '#DC2626' } :
                    task.priority === 'medium' ? { background: '#FEF3C7', color: '#D97706' } :
                                                 { background: '#F0FDF4', color: '#16A34A' }
                  }>{task.priority}</span>
                )}
                {task.due_date && (
                  <span className="text-[11px] font-mono" style={{ color: '#9CA3AF' }}>
                    {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                {task.assignees?.slice(0, 1).map(a => (
                  <img key={a.id} src={a.avatar_url} className="w-5 h-5 rounded-full ml-auto flex-shrink-0" alt={a.name} title={a.name} />
                ))}
              </div>
            </div>
          ))}
          {col.tasks.length === 0 && <div className="text-[12px] text-center py-2" style={{ color: '#D1D5DB' }}>No tasks</div>}
        </div>
      ))}
    </div>
  );
}

// ── Pipeline panel ────────────────────────────────────────────────────────────
function PipelinePanel({ deals, onAddDeal }: { deals: PipelineDeal[]; onAddDeal: () => void }) {
  const [aiBannerDismissed, setAiBannerDismissed] = useState(false);
  return (
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2" style={{ scrollbarWidth: 'thin' }}>
      {!aiBannerDismissed && (
        <div className="rounded-lg p-3 mb-1 border" style={{ background: 'linear-gradient(135deg, #EDE9FE, #F5F3FF)', borderColor: '#C4B5FD' }}>
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#7C3AED' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            AI Detected Opportunity
          </div>
          <div className="text-[13px] text-gray-800 leading-snug mb-2">Recent conversation shows strong buying signals.</div>
          <div className="flex gap-1.5">
            <button onClick={() => { onAddDeal(); setAiBannerDismissed(true); }} className="px-3 py-1 rounded-md text-[12px] font-medium text-white" style={{ background: '#7C3AED' }}>Add to Pipeline</button>
            <button onClick={() => setAiBannerDismissed(true)} className="px-2.5 py-1 rounded-md text-[12px] font-medium border" style={{ color: '#6B7280', borderColor: '#E5E7EB', background: 'transparent' }}>Dismiss</button>
          </div>
        </div>
      )}
      {PIPELINE_STAGES.map(stage => {
        const items = deals.filter(d => d.stage === stage.id);
        if (!items.length) return null;
        return (
          <div key={stage.id} className="mb-2">
            <div className="flex items-center gap-2 mb-1.5 px-0.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: stage.color }} />
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: stage.color }}>{stage.label}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#E5E7EB', color: '#9CA3AF' }}>{items.length}</span>
            </div>
            {items.map(deal => (
              <div key={deal.id} className="rounded-lg px-3 py-2.5 mb-1.5 cursor-pointer transition-all"
                style={{ background: '#F8F9FC', border: '1px solid #E5E7EB' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div className="text-[13px] font-semibold text-gray-900">{deal.company}</div>
                <div className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>{deal.detail}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[13px] font-bold" style={{ color: '#7C3AED' }}>{deal.value}</span>
                  <span className="text-[11px]" style={{ color: '#9CA3AF' }}>{deal.prob}</span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Heavy panels/modals — lazily loaded only when needed
const ThreadPanel     = lazy(() => import('../components/ThreadPanel'));
const TaskDetailPanel = lazy(() => import('../components/TaskDetailPanel'));
const CreateTaskModal = lazy(() => import('../components/CreateTaskModal'));
const ShareModal      = lazy(() => import('../components/ShareModal'));

export default function ChannelView() {
  const { channelId } = useParams<{ channelId: string }>();
  const { channels, members } = useWorkspaceStore();
  const { activeThreadId, setActiveThreadId, clearThreadUnread } = useUIStore();
  const clearChannelUnread = useUIStore(s => s.clearChannelUnread);
  const { user } = useAuthStore();
  const { boards, columns, fetchColumns, selectedTask, setSelectedTask } = useBoardStore();

  const endRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const channel = channels.find(c => c.id === channelId);

  const {
    messages, loading, content, typingUsers, setMessages,
    handleContentChange, handleSend,
    handleMsgUpdated, handleMsgDeleted, handleReactionToggle, handleTaskLinked,
  } = useChatMessages({
    type: 'channel',
    id: channelId,
    user,
    endRef,
    onClearUnread: () => channelId && clearChannelUnread(channelId),
    highlightId: searchParams.get('highlight'),
  });

  // ── Channel-specific state ────────────────────────────────────────────────
  const [shareMsg, setShareMsg]       = useState<Message | null>(null);
  const [createTaskMsg, setCreateTaskMsg] = useState<Message | null>(null);
  const [createTaskPrefill, setCreateTaskPrefill] = useState<{ title?: string; priority?: string; due_date?: string } | undefined>(undefined);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [rightTab, setRightTab]       = useState<'tasks' | 'pipeline'>('tasks');
  const [pipeline, setPipeline]       = useState<PipelineDeal[]>(INITIAL_PIPELINE);

  const activeBoard  = boards[0];
  const totalTasks   = columns.reduce((sum, c) => sum + c.tasks.length, 0);
  const canArchive   = user && !channel?.is_archived && (channel?.created_by === user.id || useWorkspaceStore.getState().isAdmin(user.id));

  useEffect(() => {
    if (activeBoard && columns.length === 0) fetchColumns(activeBoard.id);
  }, [activeBoard?.id]);

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

  const handleArchive = async () => {
    if (!channelId || !confirm('Are you sure you want to archive this channel?')) return;
    try { await client.patch(`/api/channels/${channelId}/archive`); }
    catch { alert('Failed to archive channel'); }
  };

  const handleAddPipelineDeal = () => {
    setPipeline(prev => [
      { id: `p-${Date.now()}`, company: 'New Opportunity', detail: 'Detected from conversation', value: 'TBD', prob: 'New lead', stage: 'lead' },
      ...prev,
    ]);
    setRightTab('pipeline');
  };

  // ── Right panel content ───────────────────────────────────────────────────
  const threadMsg = activeThreadId
    ? (messages.find(m => m.id === activeThreadId) ?? (createTaskMsg?.id === activeThreadId ? createTaskMsg : null))
    : null;

  const panelContent = threadMsg ? (
    <Suspense fallback={<MessageListSkeleton count={4} />}>
      <ThreadPanel parentMessage={threadMsg} onClose={() => setActiveThreadId(null)}
        channelId={channelId!} onCreateTask={handleOpenCreateTask} onShare={handleShare}
        onMessageUpdated={handleMsgUpdated} onMessageDeleted={handleMsgDeleted} />
    </Suspense>
  ) : selectedTask ? (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b flex-shrink-0 cursor-pointer transition-colors hover:bg-gray-50"
        style={{ borderColor: '#E5E7EB' }} onClick={() => setSelectedTask(null)}>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: '#7C3AED' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        <span className="text-[12.5px] font-medium" style={{ color: '#7C3AED' }}>Back to Task Board</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<div className="animate-pulse p-5 space-y-3"><div className="h-4 bg-gray-100 rounded w-3/4" /></div>}>
          <TaskDetailPanel />
        </Suspense>
      </div>
    </div>
  ) : (
    <>
      <div className="flex items-center justify-between px-4 py-3.5 border-b flex-shrink-0" style={{ borderColor: '#E5E7EB' }}>
        <h3 className="text-[14px] font-semibold text-gray-900">{rightTab === 'tasks' ? 'Task Board' : 'Opportunities Pipeline'}</h3>
        <span className="text-[12px]" style={{ color: '#9CA3AF' }}>
          {rightTab === 'tasks' ? `${totalTasks} total` : `${pipeline.length} active`}
        </span>
      </div>
      {rightTab === 'tasks' ? <KanbanPanel columns={columns} /> : <PipelinePanel deals={pipeline} onAddDeal={handleAddPipelineDeal} />}
    </>
  );

  return (
    <div className="flex h-full relative">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-200 flex-shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-lg font-light">#</span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-gray-900">{channel?.name || 'Loading…'}</h1>
                {channel?.is_archived === 1 && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500">Archived</span>}
              </div>
              <p className="text-xs text-gray-400">{channel?.is_private ? 'Private channel' : 'Public channel'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {(['tasks', 'pipeline'] as const).map(tab => (
              <button key={tab} onClick={() => { setRightTab(tab); setActiveThreadId(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-all capitalize"
                style={!activeThreadId && rightTab === tab
                  ? { background: '#7C3AED', color: '#fff' }
                  : { background: '#F8F9FC', color: '#6B7280' }
                }
              >
                {tab === 'tasks' ? `Tasks (${totalTasks})` : `Pipeline (${pipeline.length})`}
              </button>
            ))}
            {canArchive && (
              <button onClick={handleArchive} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100 ml-2">
                Archive
              </button>
            )}
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto py-4 space-y-0.5">
          {loading && <MessageListSkeleton count={7} />}
          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3"><span className="text-2xl">#</span></div>
              <h3 className="font-semibold text-gray-900 mb-1">Welcome to #{channel?.name}!</h3>
              <p className="text-sm text-gray-500">This is the beginning of the channel. Say hello! 👋</p>
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
          {channel?.is_archived ? (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-center text-sm text-gray-400">
              This channel is archived — read-only.
            </div>
          ) : (
            <MessageComposer value={content} onChange={handleContentChange} onSubmit={handleSend}
              placeholder={`Message #${channel?.name || ''}…`} members={members} />
          )}
        </div>
      </div>

      {/* Right panel slot */}
      <>
        <div className="hidden xl:flex flex-col flex-shrink-0 border-l" style={{ width: 320, background: '#FFFFFF', borderColor: '#E5E7EB' }}>
          {panelContent}
        </div>
        {threadMsg && (
          <div className="xl:hidden absolute right-0 top-0 h-full z-20 flex flex-col border-l bg-white shadow-xl animate-slide-in" style={{ width: 320, borderColor: '#E5E7EB' }}>
            {panelContent}
          </div>
        )}
      </>

      {showCreateTask && activeBoard && (
        <Suspense fallback={null}>
          <CreateTaskModal prefilledMessage={createTaskMsg} prefilledData={createTaskPrefill} boardId={activeBoard.id} onClose={handleCreateTask} />
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
