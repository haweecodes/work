import { useState, useRef, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';
import UserAvatar from '../components/UserAvatar';
import useUIStore from '../store/uiStore';
import useBoardStore from '../store/boardStore';
import { useChatMessages } from '../hooks/useChatMessages';
import MessageList from '../components/MessageList';
import MessageComposer from '../components/MessageComposer';
import { MessageListSkeleton } from '../components/Skeleton';
import type { Message } from '../types';


export default function DMView() {
  const { threadId } = useParams<{ threadId: string }>();
  const user = useAuthStore(s => s.user);
  const dmThreads        = useWorkspaceStore(s => s.dmThreads);
  const members          = useWorkspaceStore(s => s.members);
  const clearThreadUnread = useUIStore(s => s.clearThreadUnread);
  const clearDmUnread    = useUIStore(s => s.clearDmUnread);
  const activeSidebar    = useUIStore(s => s.activeSidebar);
  const openSidebar      = useUIStore(s => s.openSidebar);
  const closeSidebar     = useUIStore(s => s.closeSidebar);
  const openShareModal   = useUIStore(s => s.openShareModal);
  const columns          = useBoardStore(s => s.columns);

  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const thread = dmThreads.find(t => t.id === threadId);
  const otherParticipants = thread?.participants?.filter(p => p.id !== user?.id) || [];
  const title = otherParticipants.map(p => p.name).join(', ') || 'Direct Message';
  const {
    messages, loading, hasMore, loadingMore, content, typingUsers,
    handleContentChange, handleSend,
    handleMsgUpdated, handleMsgDeleted, handleReactionToggle, handleTaskLinked,
    loadMore,
  } = useChatMessages({
    type: 'dm',
    id: threadId,
    user,
    endRef,
    scrollRef,
    onClearUnread: () => { threadId && clearDmUnread(threadId); closeSidebar(); },
    highlightId: searchParams.get('highlight'),
  });

  // ── Composer meta state ───────────────────────────────────────────────────
  const [importance, setImportance] = useState('normal');

  const handleSubmit = (e: React.SyntheticEvent) => {
    handleSend(e, { importance });
    setImportance('normal');
  };

  const myTaskCount = columns.reduce((sum, c) => sum + c.tasks.filter(t => t.assignees?.some(a => a.id === user?.id)).length, 0);

  const handleReply = (msg: Message) => {
    openSidebar({ type: 'thread', message: msg, dmThreadId: threadId! });
    clearThreadUnread(msg.id);
  };

  // ── Open thread from URL param (e.g. navigate from linked message) ────────
  const threadIdParam = searchParams.get('threadId');
  useEffect(() => {
    if (!threadIdParam || messages.length === 0) return;
    const msg = messages.find(m => m.id === threadIdParam);
    if (msg) {
      openSidebar({ type: 'thread', message: msg, dmThreadId: threadId! });
      setSearchParams(p => { p.delete('threadId'); return p; }, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadIdParam, messages.length]);

  return (
    <div className="flex h-full relative">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0"
          style={{ padding: '22px 40px 18px', borderBottom: '1px solid var(--rule)', background: 'var(--paper)' }}>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {otherParticipants.slice(0, 2).map((p, i) => {
                const live = members.find(m => m.id === p.id);
                return (
                  <UserAvatar
                    key={p.id}
                    src={p.avatar_url}
                    name={p.name}
                    size={28}
                    statusEmoji={live?.status_emoji}
                    statusText={live?.status_text}
                    style={{ border: '1px solid var(--paper)', zIndex: i === 0 ? 1 : 0 }}
                  />
                );
              })}
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--ink)' }}>{title}</h1>
              {otherParticipants.length === 1 && (() => {
                const live = members.find(m => m.id === otherParticipants[0].id);
                return live?.status_emoji || live?.status_text ? (
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {live.status_emoji} {live.status_text}
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Direct message</p>
                );
              })()}
              {otherParticipants.length !== 1 && (
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Direct message</p>
              )}
            </div>
          </div>
          <div className="flex items-baseline gap-6">
            <button
              onClick={() => activeSidebar?.type === 'tasks' ? closeSidebar() : openSidebar({ type: 'tasks' })}
              style={{
                fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: activeSidebar?.type === 'tasks' ? 'var(--ink)' : 'var(--muted)',
                borderBottom: `1px solid ${activeSidebar?.type === 'tasks' ? 'var(--ink)' : 'transparent'}`,
                paddingBottom: 2, background: 'none',
              }}
              onMouseEnter={e => { if (activeSidebar?.type !== 'tasks') e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={e => { if (activeSidebar?.type !== 'tasks') e.currentTarget.style.color = 'var(--muted)'; }}
            >
              Tasks{myTaskCount > 0 ? ` · ${myTaskCount}` : ''}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-0" style={{ paddingTop: 22, paddingBottom: 8 }}>
          {loading && <MessageListSkeleton count={6} />}
          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="flex -space-x-2 mb-3">
                {otherParticipants.slice(0, 2).map((p, i) => {
                  const live = members.find(m => m.id === p.id);
                  return (
                    <UserAvatar
                      key={p.id}
                      src={p.avatar_url}
                      name={p.name}
                      size={48}
                      statusEmoji={live?.status_emoji}
                      statusText={live?.status_text}
                      style={{ border: '2px solid white', zIndex: i === 0 ? 1 : 0 }}
                    />
                  );
                })}
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Start a conversation</h3>
              <p className="text-sm text-gray-500">This is the beginning of your DM with <strong>{title}</strong>.</p>
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
          <MessageComposer value={content} onChange={handleContentChange} onSubmit={handleSubmit}
            placeholder={`Message ${title}…`} members={members}
            importance={importance} onImportanceChange={setImportance} />
        </div>
      </div>
    </div>
  );
}
