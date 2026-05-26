import { useState, useEffect, useContext, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';
import SocketContext from '../context/SocketContext';
import MessageBubble from './MessageBubble';
import MessageComposer, { type MessageComposerHandle } from './MessageComposer';
import type { Message, Reaction } from '../types';

interface ThreadPanelProps {
  parentMessage: Message;
  onClose: () => void;
  channelId?: string;
  dmThreadId?: string;
  onCreateTask: (msg: Message) => void;
  onShare: (msg: Message) => void;
  /** Notify parent list when a message is edited so both views stay in sync */
  onMessageUpdated?: (msgId: string, content: string, editedAt?: string) => void;
  /** Notify parent list when a message is deleted */
  onMessageDeleted?: (msgId: string) => void;
}

export default function ThreadPanel({
  parentMessage,
  onClose,
  channelId,
  dmThreadId,
  onCreateTask,
  onShare,
  onMessageUpdated,
  onMessageDeleted,
}: ThreadPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  /** The specific thread message being replied to (for nested replies) */
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const { user } = useAuthStore();
  const members = useWorkspaceStore(s => s.members);
  const socketRef = useContext(SocketContext);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<MessageComposerHandle>(null);
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });

  const handleReactionToggle = (messageId: string, reactions: Reaction[]) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
  };

  // Update local thread state and notify the parent message list
  const handleMsgUpdated = (msgId: string, content: string, editedAt?: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content, edited_at: editedAt ?? new Date().toISOString() } : m));
    onMessageUpdated?.(msgId, content, editedAt);
  };

  const handleMsgDeleted = (msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted: true } : m));
    onMessageDeleted?.(msgId);
  };

  // Build thread fetch URL
  const threadUrl = channelId
    ? `/api/channels/messages/${channelId}/thread/${parentMessage.id}`
    : `/api/dms/${dmThreadId}/thread/${parentMessage.id}`;

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setReplyingTo(null);

    client.get<Message[]>(threadUrl)
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
        }, 100);
      })
      .catch(() => setLoading(false));

    const socket = socketRef?.current;
    if (socket) {
      const handleNewMessage = (msg: Message) => {
        // Accept if channel or DM matches
        const inChannel = channelId && msg.channel_id === channelId;
        const inDm = dmThreadId && msg.dm_thread_id === dmThreadId;
        if (!inChannel && !inDm) return;

        // Use functional setState so we always have the latest messages list
        // (avoids the stale-closure problem with messages.some())
        setMessages(prev => {
          const inThread =
            msg.parent_message_id === parentMessage.id ||
            prev.some(m => m.id === msg.parent_message_id);

          if (!inThread) return prev;
          if (prev.some(m => m.id === msg.id)) return prev; // dedupe

          // Update reply_count on the depth-1 parent if this is a depth-2 reply
          const updated = prev.map(m =>
            m.id === msg.parent_message_id && msg.parent_message_id !== parentMessage.id
              ? { ...m, reply_count: (m.reply_count || 0) + 1 }
              : m
          );
          return [...updated, msg];
        });
        setTimeout(scrollToBottom, 100);
      };

      const eventName = channelId ? 'new_message' : 'new_dm';
      socket.on(eventName, handleNewMessage);

      const handleReactionUpdated = ({ messageId, reactions }: { messageId: string; reactions: Reaction[] }) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
      };

      const handleMessageUpdated = ({ messageId, content: c, editedAt }: { messageId: string; content: string; editedAt?: string }) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: c, edited_at: editedAt ?? new Date().toISOString() } : m));
      };

      const handleMessageDeleted = ({ messageId }: { messageId: string }) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted: true } : m));
      };

      socket.on('reaction_updated',  handleReactionUpdated);
      socket.on('message_updated',   handleMessageUpdated);
      socket.on('message_deleted',   handleMessageDeleted);

      return () => {
        socket.off(eventName,          handleNewMessage);
        socket.off('reaction_updated', handleReactionUpdated);
        socket.off('message_updated',  handleMessageUpdated);
        socket.off('message_deleted',  handleMessageDeleted);
      };
    }
  }, [parentMessage.id, channelId, dmThreadId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    const text = content.trim();
    const replyTarget = replyingTo;
    setContent('');
    setReplyingTo(null);

    try {
      if (channelId) {
        await client.post('/api/channels/messages', {
          channel_id: channelId,
          content: text,
          // If replyingTo is set and it's a depth-1 message, reply directly to it;
          // otherwise reply to the root parent
          parent_message_id: replyTarget ? replyTarget.id : parentMessage.id,
        });
      } else {
        await client.post(`/api/dms/${dmThreadId}`, {
          content: text,
          parent_message_id: replyTarget ? replyTarget.id : parentMessage.id,
        });
      }
    } catch {
      setContent(text);
    }
  };

  const handleReplyToMsg = (msg: Message) => {
    // Clicking reply on any depth-0 message sets replyingTo + focuses compose
    setReplyingTo(msg);
    setTimeout(() => composerRef.current?.focus(), 50);
  };

  /** Scroll to a specific message in the thread list (used by quoted-card click) */
  const scrollToMsg = (msg: Message) => {
    const el = document.querySelector(`[data-msg-id="${msg.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('msg-highlight');
      setTimeout(() => el.classList.remove('msg-highlight'), 3000);
    }
  };


  // Determine visual depth for each message
  const getDepth = (msg: Message): 0 | 1 => {
    if (msg.parent_message_id === parentMessage.id) return 0;
    return 1; // parent is a depth-0 reply
  };

  /** For depth-1 messages: find the depth-0 message they're replying to */
  const getReplyTo = (msg: Message): Message | undefined => {
    if (getDepth(msg) !== 1) return undefined;
    return messages.find(m => m.id === msg.parent_message_id);
  };



  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--paper)' }}>

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0"
        style={{ padding: '18px 28px 16px', borderBottom: '1px solid var(--rule)' }}>
        <div className="flex items-baseline gap-3">
          <h3 style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)' }}>Thread</h3>
          {messages.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--faint)', fontVariantNumeric: 'tabular-nums' }}>
              {messages.length} {messages.length === 1 ? 'reply' : 'replies'}
            </span>
          )}
        </div>
        <button onClick={onClose}
          style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--faint)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
          Close
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin' }}>

        {/* Root message */}
        <div style={{ borderBottom: '1px solid var(--rule)' }}>
          <MessageBubble
            msg={parentMessage}
            onCreateTask={onCreateTask}
            onShare={onShare}
            onMessageUpdated={handleMsgUpdated}
            onMessageDeleted={handleMsgDeleted}
            inThread
          />
        </div>

        {/* Reply count divider */}
        {messages.length > 0 && (
          <div className="flex items-center gap-3 px-6 py-3">
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)' }}>
              {messages.length} {messages.length === 1 ? 'Reply' : 'Replies'}
            </span>
            <div className="flex-1" style={{ height: 1, background: 'var(--rule-2)' }} />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-4 h-4 border-2 animate-spin" style={{ borderColor: 'var(--rule)', borderTopColor: 'var(--ink)' }} />
          </div>
        ) : (
          <div className="pb-2">
            {messages.map((msg, i) => {
              const depth = getDepth(msg);
              const replyTo = getReplyTo(msg);
              const prev = messages[i - 1];
              const isContinuation = !!prev
                && !msg.is_system && !prev.is_system
                && !msg.deleted && !prev.deleted
                && msg.sender_id === prev.sender_id
                && depth === getDepth(prev)
                && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60 * 1000;
              return (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  depth={depth}
                  inThread
                  replyTo={replyTo}
                  isContinuation={isContinuation}
                  onCreateTask={onCreateTask}
                  onShare={onShare}
                  onMessageUpdated={handleMsgUpdated}
                  onMessageDeleted={handleMsgDeleted}
                  onReactionToggle={handleReactionToggle}
                  onReply={depth === 0 ? handleReplyToMsg : scrollToMsg}
                />
              );
            })}
            {messages.length === 0 && !loading && (
              <p className="text-center py-6" style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>
                No replies yet
              </p>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Compose area */}
      <div className="flex-shrink-0" style={{ padding: '14px 28px 18px', borderTop: '1px solid var(--rule)' }}>
        {replyingTo && (
          <div className="flex items-baseline gap-2 mb-3"
            style={{ borderLeft: '2px solid var(--rule)', paddingLeft: 10 }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }} className="truncate">
              <span style={{ fontWeight: 500, color: 'var(--ink-2)' }}>{replyingTo.sender?.name}</span>
              {' — '}{replyingTo.content.slice(0, 60)}
            </p>
            <button type="button" onClick={() => setReplyingTo(null)}
              style={{ fontSize: 11, color: 'var(--faint)', flexShrink: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
              ✕
            </button>
          </div>
        )}
        <MessageComposer
          ref={composerRef}
          variant="inline"
          compact
          value={content}
          onChange={setContent}
          onSubmit={handleSend}
          placeholder={replyingTo ? `Reply to ${replyingTo.sender?.name}…` : 'Reply in thread…'}
          onKeyDown={e => { if (e.key === 'Escape' && replyingTo) setReplyingTo(null); }}
          members={members}
        />
      </div>
    </div>
  );
}
