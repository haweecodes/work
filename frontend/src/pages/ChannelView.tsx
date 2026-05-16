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
import PanelOverlay from '../components/PanelOverlay';
import TaskTray from '../components/TaskTray';
import SendPriorityAlertModal from '../components/SendPriorityAlertModal';
import { MessageListSkeleton } from '../components/Skeleton';
import type { Message, Task } from '../types';

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
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [showSendAlert, setShowSendAlert] = useState(false);

  const activeBoard  = boards[0];
  const myTaskCount  = columns.reduce((sum, c) => sum + c.tasks.filter(t => t.assignees?.some(a => a.id === user?.id)).length, 0);
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
      <Suspense fallback={<div className="animate-pulse p-5 space-y-3"><div className="h-4 bg-gray-100 rounded w-3/4" /></div>}>
        <TaskDetailPanel onBack={() => { setSelectedTask(null); setShowTaskPanel(true); }} />
      </Suspense>
    </div>
  ) : showTaskPanel ? (
    rightTab === 'tasks'
      ? <TaskTray columns={columns} userId={user?.id ?? ''} boardId={activeBoard?.id} onClose={() => setShowTaskPanel(false)} />
      : <>
          <div className="flex-shrink-0 border-b" style={{ borderColor: '#E5E7EB' }}>
            <div className="flex items-center justify-between px-4 py-3">
              <h3 className="text-[14px] font-semibold text-gray-900">Opportunities Pipeline</h3>
              <button onClick={() => setShowTaskPanel(false)} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <PipelinePanel deals={pipeline} onAddDeal={handleAddPipelineDeal} />
        </>
  ) : null;

  return (
    <div className="flex h-full relative">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0"
          style={{ padding: '22px 40px 18px', borderBottom: '1px solid var(--rule)', background: 'var(--paper)' }}>
          <div>
            <div className="flex items-baseline gap-2">
              <span style={{ color: 'var(--faint)', fontWeight: 400, marginRight: 2 }}>#</span>
              <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--ink)' }}>
                {channel?.name || 'Loading…'}
              </h1>
              {channel?.is_archived === 1 && (
                <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)' }}>
                  Archived
                </span>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {channel?.is_private ? 'Private channel' : 'Public channel'}
            </p>
          </div>
          <div className="flex items-baseline gap-6 ml-auto">
            {(['tasks', 'pipeline'] as const).map(tab => {
              const isActive = showTaskPanel && !activeThreadId && rightTab === tab;
              return (
                <button key={tab}
                  onClick={() => {
                    if (showTaskPanel && rightTab === tab && !activeThreadId) {
                      setShowTaskPanel(false);
                    } else {
                      setShowTaskPanel(true);
                      setRightTab(tab);
                      setActiveThreadId(null);
                    }
                  }}
                  style={{
                    fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: isActive ? 'var(--ink)' : 'var(--muted)',
                    borderBottom: `1px solid ${isActive ? 'var(--ink)' : 'transparent'}`,
                    paddingBottom: 4, background: 'none',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--ink)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--muted)'; }}
                >
                  {tab === 'tasks'
                    ? `Tasks${myTaskCount > 0 ? ` · ${myTaskCount}` : ''}`
                    : `Pipeline${pipeline.length > 0 ? ` · ${pipeline.length}` : ''}`}
                </button>
              );
            })}
            <button onClick={() => setShowSendAlert(true)}
              style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--danger)', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
              Alert
            </button>
            {canArchive && (
              <button onClick={handleArchive}
                style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--danger)' }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
              >
                Archive
              </button>
            )}
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto space-y-0" style={{ padding: '22px 0 8px' }}>
          {loading && <MessageListSkeleton count={7} />}
          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-10">
              <p style={{ fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 8 }}>
                #{channel?.name}
              </p>
              <p style={{ fontSize: 15, color: 'var(--ink-2)' }}>Beginning of channel. Say hello!</p>
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
          {channel?.is_archived ? (
            <p style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic', textAlign: 'center' }}>
              This channel is archived — read-only.
            </p>
          ) : (
            <MessageComposer value={content} onChange={handleContentChange} onSubmit={handleSend}
              placeholder={`Message #${channel?.name || ''}…`} members={members} />
          )}
        </div>
      </div>

      {/* Right panel — absolute overlay so messages never shift */}
      {(threadMsg || selectedTask || showTaskPanel) && (
        <PanelOverlay>{panelContent}</PanelOverlay>
      )}

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
      {showSendAlert && <SendPriorityAlertModal onClose={() => setShowSendAlert(false)} />}
    </div>
  );
}
