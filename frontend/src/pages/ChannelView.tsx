import { useState, useEffect, useRef, useCallback } from 'react';
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
import type { Message, MentionPriority } from '../types';

export default function ChannelView() {
  const { channelId } = useParams<{ channelId: string }>();
  const channels         = useWorkspaceStore(s => s.channels);
  const members          = useWorkspaceStore(s => s.members);
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace);
  const activeSidebar    = useUIStore(s => s.activeSidebar);
  const openSidebar      = useUIStore(s => s.openSidebar);
  const closeSidebar     = useUIStore(s => s.closeSidebar);
  const openShareModal   = useUIStore(s => s.openShareModal);
  const clearThreadUnread  = useUIStore(s => s.clearThreadUnread);
  const clearChannelUnread = useUIStore(s => s.clearChannelUnread);
  const { user } = useAuthStore();
  const boards       = useBoardStore(s => s.boards);
  const columns      = useBoardStore(s => s.columns);
  const fetchColumns = useBoardStore(s => s.fetchColumns);

  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const channel = channels.find(c => c.id === channelId);

  const {
    messages, loading, hasMore, loadingMore, content, typingUsers,
    handleContentChange, handleSend,
    handleMsgUpdated, handleMsgDeleted, handleReactionToggle, handleTaskLinked,
    loadMore,
  } = useChatMessages({
    type: 'channel',
    id: channelId,
    user,
    endRef,
    scrollRef,
    onClearUnread: () => channelId && clearChannelUnread(channelId),
    highlightId: searchParams.get('highlight'),
  });

  // ── Composer meta state ───────────────────────────────────────────────────
  const [importance, setImportance] = useState('normal');
  const [mentionPriorities, setMentionPriorities] = useState<MentionPriority[]>([]);
  const [priorityAlertRecipients, setPriorityAlertRecipients] = useState<Array<{ userId: string; name: string }>>([]);

  const handleMentionPrioritySet = useCallback((name: string, userId: string, priority: string) => {
    setMentionPriorities(prev => [
      ...prev.filter(mp => mp.userId !== userId),
      { userId, name, priority: priority as MentionPriority['priority'] },
    ]);
  }, []);

  const handlePriorityAlertMentionAdd = useCallback((userId: string, name: string) => {
    setPriorityAlertRecipients(prev => [
      ...prev.filter(r => r.userId !== userId),
      { userId, name },
    ]);
  }, []);

  const handleSubmit = useCallback((e: React.SyntheticEvent) => {
    const alertText = content.trim();
    handleSend(e, { importance, mentionPriorities });
    if (priorityAlertRecipients.length > 0 && alertText) {
      client.post('/api/notifications/priority', {
        recipient_ids: priorityAlertRecipients.map(r => r.userId),
        message: alertText,
        workspace_id: currentWorkspace?.id,
      }).catch(() => {});
    }
    setImportance('normal');
    setMentionPriorities([]);
    setPriorityAlertRecipients([]);
  }, [content, handleSend, importance, mentionPriorities, priorityAlertRecipients, currentWorkspace?.id]);

  // ── Board columns ─────────────────────────────────────────────────────────
  const activeBoard = boards[0];
  const myTaskCount = columns.reduce((sum, c) => sum + c.tasks.filter(t => t.assignees?.some(a => a.id === user?.id)).length, 0);
  const canArchive  = user && !channel?.is_archived && (channel?.created_by === user.id || useWorkspaceStore.getState().isAdmin(user.id));

  useEffect(() => {
    if (activeBoard && columns.length === 0) fetchColumns(activeBoard.id);
  }, [activeBoard?.id]);

  // ── Open thread from URL param (e.g. navigate from shared message) ────────
  const threadIdParam = searchParams.get('threadId');
  useEffect(() => {
    if (!threadIdParam || messages.length === 0) return;
    const msg = messages.find(m => m.id === threadIdParam);
    if (msg) {
      openSidebar({ type: 'thread', message: msg, channelId: channelId! });
      setSearchParams(p => { p.delete('threadId'); return p; }, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadIdParam, messages.length]);

  const handleReply = useCallback((msg: Message) => {
    openSidebar({ type: 'thread', message: msg, channelId: channelId! });
    clearThreadUnread(msg.id);
  }, [openSidebar, channelId, clearThreadUnread]);

  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const handleArchive = useCallback(async () => {
    if (!channelId) return;
    setArchiving(true);
    try {
      await client.patch(`/api/channels/${channelId}/archive`);
      setShowArchiveConfirm(false);
    } finally {
      setArchiving(false);
    }
  }, [channelId]);

  const tasksActive = activeSidebar?.type === 'tasks';

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
            {showArchiveConfirm ? (
              <div className="flex items-baseline gap-3 animate-fade-in">
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Archive channel?</span>
                <button onClick={handleArchive} disabled={archiving}
                  style={{ fontSize: 12, color: 'var(--danger)', letterSpacing: '0.06em', textTransform: 'uppercase', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {archiving ? '…' : 'Confirm'}
                </button>
                <button onClick={() => setShowArchiveConfirm(false)} disabled={archiving}
                  style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => tasksActive ? closeSidebar() : openSidebar({ type: 'tasks' })}
                  style={{
                    fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: tasksActive ? 'var(--ink)' : 'var(--muted)',
                    borderBottom: `1px solid ${tasksActive ? 'var(--ink)' : 'transparent'}`,
                    paddingBottom: 4, background: 'none',
                  }}
                  onMouseEnter={e => { if (!tasksActive) e.currentTarget.style.color = 'var(--ink)'; }}
                  onMouseLeave={e => { if (!tasksActive) e.currentTarget.style.color = 'var(--muted)'; }}
                >
                  Tasks{myTaskCount > 0 ? ` · ${myTaskCount}` : ''}
                </button>
                {canArchive && (
                  <button onClick={() => setShowArchiveConfirm(true)}
                    style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--danger)' }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                  >
                    Archive
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Message list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-0" style={{ padding: '22px 0 8px' }}>
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
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            onTaskLinked={handleTaskLinked}
            onMessageUpdated={handleMsgUpdated}
            onMessageDeleted={handleMsgDeleted}
            onReply={handleReply}
            onReactionToggle={handleReactionToggle}
            onShare={openShareModal}
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
            <MessageComposer value={content} onChange={handleContentChange} onSubmit={handleSubmit}
              placeholder={`Message #${channel?.name || ''}…`} members={members}
              importance={importance} onImportanceChange={setImportance}
              onMentionPrioritySet={handleMentionPrioritySet}
              onPriorityAlertMentionAdd={handlePriorityAlertMentionAdd}
              priorityAlertRecipients={priorityAlertRecipients} />
          )}
        </div>
      </div>
    </div>
  );
}
